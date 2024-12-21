const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const { createClient } = require('@deepgram/sdk');
const fs = require('fs').promises;
const path = require('path');
const pLimit = require('p-limit');
const { v4: uuidv4 } = require('uuid');
const { rimraf } = require('rimraf');
const m3u8Parser = require('m3u8-parser');

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

class VideoService {
  async processVideo(sbatId) {
    const jobId = uuidv4();
    const outputDir = path.join(__dirname, '../temp', jobId);
    
    try {
      await fs.mkdir(outputDir, { recursive: true });
      console.log(`Created temporary directory: ${outputDir}`);

      // Fetch m3u8 URLs from Scaler API
      const apiResponse = await axios.get(
        `https://metabase.interviewbit.com/api/embed/card/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZXNvdXJjZSI6eyJxdWVzdGlvbiI6MjA2MDN9LCJwYXJhbXMiOnt9LCJleHAiOjE3NDE3MDk1NTN9.Z6ob2UjkUXJyfNe8wFc2i2qnfevKkIa4Y63Awmrde3g/query`,
        {
          params: { sbat_id: sbatId }
        }
      );

      const m3u8Urls = apiResponse.data.data.rows.map(row => row[0]);
      console.log(`Found ${m3u8Urls.length} m3u8 URLs for sbatId: ${sbatId}`);

      if (m3u8Urls.length === 0) {
        throw new Error('No m3u8 URLs found for the given sbatId');
      }

      const limit = pLimit(50);
      let allSegmentPaths = [];

      for (let i = 0; i < m3u8Urls.length; i++) {
        const m3u8Url = m3u8Urls[i];
        console.log(`Processing m3u8 ${i + 1}/${m3u8Urls.length}`);

        // Fetch m3u8 content
        const m3u8Response = await axios.get(m3u8Url);
        const parser = new m3u8Parser.Parser();
        parser.push(m3u8Response.data);
        parser.end();
        
        const segments = parser.manifest.segments;
        console.log(`Found ${segments.length} video segments in m3u8 ${i + 1}`);

        if (segments.length === 0) {
          console.warn(`No segments found in m3u8 ${i + 1}. Skipping.`);
          continue;
        }

        const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf("/") + 1);

        // Download segments in parallel
        const downloadPromises = segments.map((segment, j) => {
          return limit(async () => {
            const segmentUrl = new URL(segment.uri, baseUrl).toString();
            console.log(`Downloading segment ${j + 1}/${segments.length} from m3u8 ${i + 1}`);
            const response = await axios.get(segmentUrl, { responseType: 'arraybuffer' });
            const segmentPath = path.join(outputDir, `segment_${i}_${j}.ts`);
            await fs.writeFile(segmentPath, response.data);
            return { index: j, path: segmentPath };
          });
        });

        const downloadedSegments = await Promise.all(downloadPromises);
        downloadedSegments.sort((a, b) => a.index - b.index);
        allSegmentPaths.push(...downloadedSegments.map(segment => segment.path));
      }

      if (allSegmentPaths.length === 0) {
        throw new Error('No segments were downloaded successfully');
      }

      console.log('All segments downloaded successfully');

      // Create file list for FFmpeg
      const fileList = allSegmentPaths.map(p => `file '${p}'`).join('\n');
      const fileListPath = path.join(outputDir, 'filelist.txt');
      await fs.writeFile(fileListPath, fileList);

      // Merge segments
      const mergedFile = path.join(outputDir, 'merged.ts');
      await this.mergeSegments(fileListPath, mergedFile);
      console.log('Segments merged successfully');

      // Convert to MP3
      const audioPath = path.join(outputDir, 'audio.mp3');
      await this.convertToMp3(mergedFile, audioPath);
      console.log('Converted to MP3 successfully');

      // Generate transcript
      const transcript = await this.generateTranscript(audioPath);
      console.log('Transcript generated successfully');

      // Cleanup
      await this.cleanup(outputDir);
      
      return transcript;
    } catch (error) {
      console.error('Error processing video:', error);
      try {
        await this.cleanup(outputDir);
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError);
      }
      throw error;
    }
  }

  async mergeSegments(fileListPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(fileListPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions('-c copy')
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
  }

  async convertToMp3(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputPath)
        .toFormat('mp3')
        .audioChannels(1)
        .audioFrequency(16000)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .outputOptions([
          '-write_xing 0',  // Disable Xing header which can cause issues
          '-id3v2_version 0'  // Disable ID3 tags
        ])
        .output(outputPath)
        .on('start', () => {
          console.log('Starting MP3 conversion...');
          console.log(`Input file: ${inputPath}`);
          console.log(`Output file: ${outputPath}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`Processing: ${Math.floor(progress.percent)}% done`);
          }
        })
        .on('end', async () => {
          try {
            // Verify the output file exists and has content
            const stats = await fs.stat(outputPath);
            if (stats.size === 0) {
              reject(new Error('Generated MP3 file is empty'));
              return;
            }
            console.log(`MP3 conversion completed successfully (size: ${stats.size} bytes)`);
            resolve();
          } catch (err) {
            reject(new Error(`Failed to verify MP3 file: ${err.message}`));
          }
        })
        .on('error', (err) => {
          console.error('Error during MP3 conversion:', err);
          reject(err);
        })
        .run();
    });
  }

  async generateTranscript(audioPath) {
    try {
      // Verify the audio file exists and has content
      const stats = await fs.stat(audioPath);
      if (stats.size === 0) {
        throw new Error('Audio file is empty');
      }

      // Convert to WAV as a more reliable format for speech recognition
      const wavPath = audioPath.replace('.mp3', '.wav');
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(audioPath)
          .toFormat('wav')
          .audioChannels(1)
          .audioFrequency(16000)
          .audioCodec('pcm_s16le')
          .on('error', (err) => {
            console.error('Error converting to WAV:', err);
            reject(err);
          })
          .on('end', () => {
            console.log('Successfully converted to WAV');
            resolve();
          })
          .save(wavPath);
      });

      // Read the WAV file
      const audioBuffer = await fs.readFile(wavPath);
      
      console.log('Sending audio file to Deepgram (size:', audioBuffer.length, 'bytes)');
      
      const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
        {
          buffer: audioBuffer,
          mimetype: 'audio/wav'
        },
        {
          smart_format: true,
          model: 'nova-2',
          language: 'hi-Latn'
        }
      );

      if (error) {
        throw error;
      }

      // Clean up the temporary WAV file
      try {
        await fs.unlink(wavPath);
      } catch (err) {
        console.error('Error cleaning up WAV file:', err);
      }

      return result.results.channels[0].alternatives[0].transcript;
    } catch (error) {
      console.error('Transcription error:', error);
      throw new Error(`Failed to generate transcript: ${error.message}`);
    }
  }

  async cleanup(directory) {
    try {
      await rimraf(directory);
      console.log(`Cleaned up directory: ${directory}`);
    } catch (error) {
      console.error(`Error cleaning up directory ${directory}:`, error);
      throw error;
    }
  }
}

module.exports = new VideoService();
