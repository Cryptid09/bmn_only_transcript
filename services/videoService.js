const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs').promises;
const path = require('path');
const pLimit = require('p-limit');
const { v4: uuidv4 } = require('uuid');
const { rimraf } = require('rimraf');
const m3u8Parser = require('m3u8-parser');

class VideoService {
  async processVideo(sbatId) {
    const jobId = uuidv4();
    const outputDir = path.join(__dirname, '../temp', jobId);
    
    try {
      await fs.mkdir(outputDir, { recursive: true });
      console.log(`Created temporary directory: ${outputDir}`);

      const m3u8Url = `https://d1d34p8vz63oiq.cloudfront.net/eb09e648-2c19-4305-9d27-49a4a42f5fc7/${sbatId}/master.m3u8`;
      console.log('Fetching M3U8 playlist:', m3u8Url);

      const response = await axios.get(m3u8Url);
      const parser = new m3u8Parser.Parser();
      parser.push(response.data);
      parser.end();

      const segments = parser.manifest.segments;
      console.log(`Found ${segments.length} segments in playlist`);

      const allSegmentPaths = [];
      const limit = pLimit(5); // Limit concurrent downloads
      const downloadPromises = [];

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const segmentUrl = new URL(segment.uri, m3u8Url).toString();
        const outputPath = path.join(outputDir, `segment_${i}.ts`);

        downloadPromises.push(
          limit(async () => {
            try {
              const segmentResponse = await axios({
                method: 'get',
                url: segmentUrl,
                responseType: 'arraybuffer'
              });

              await fs.writeFile(outputPath, segmentResponse.data);
              console.log(`Downloading segment ${i + 1}/${segments.length} from m3u8`);
              return { index: i, path: outputPath };
            } catch (error) {
              console.error(`Error downloading segment ${i + 1}:`, error.message);
              throw error;
            }
          })
        );
      }

      const downloadedSegments = await Promise.all(downloadPromises);
      downloadedSegments.sort((a, b) => a.index - b.index);
      allSegmentPaths.push(...downloadedSegments.map(segment => segment.path));

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

      // Return the paths of the generated files
      const result = {
        mergedVideo: mergedFile,
        audioFile: audioPath
      };

      return result;
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
        .on('start', () => {
          console.log('Starting video merge...');
          console.log(`Output file: ${outputPath}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`Merging: ${Math.floor(progress.percent)}% done`);
          }
        })
        .on('end', () => {
          console.log('Video merge completed successfully');
          resolve();
        })
        .on('error', (err) => {
          console.error('Error during video merge:', err);
          reject(err);
        })
        .run();
    });
  }

  async convertToMp3(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputPath)
        .toFormat('mp3')
        .audioChannels(2)
        .audioBitrate('192k')
        .audioCodec('libmp3lame')
        .output(outputPath)
        .on('start', () => {
          console.log('Starting audio conversion...');
          console.log(`Input file: ${inputPath}`);
          console.log(`Output file: ${outputPath}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`Converting: ${Math.floor(progress.percent)}% done`);
          }
        })
        .on('end', async () => {
          try {
            const stats = await fs.stat(outputPath);
            console.log(`Audio conversion completed successfully (size: ${stats.size} bytes)`);
            resolve();
          } catch (err) {
            reject(new Error(`Failed to verify audio file: ${err.message}`));
          }
        })
        .on('error', (err) => {
          console.error('Error during audio conversion:', err);
          reject(err);
        })
        .run();
    });
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
