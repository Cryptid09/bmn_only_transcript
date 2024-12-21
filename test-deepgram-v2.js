require('dotenv').config();
const { Deepgram } = require('@deepgram/sdk');
const fs = require('fs').promises;
const path = require('path');

async function testDeepgramTranscription() {
    try {
        console.log('\nDeepgram Transcription Test (v2)');
        console.log('==============================');
        
        // 1. Check API Key
        if (!process.env.DEEPGRAM_API_KEY) {
            throw new Error('DEEPGRAM_API_KEY is not set in environment variables');
        }
        console.log('API Key:', process.env.DEEPGRAM_API_KEY);
        
        // 2. Initialize Deepgram
        console.log('\nInitializing Deepgram client...');
        const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
        
        // 3. Create a test WAV file header
        console.log('\nCreating WAV file header...');
        const wavHeader = Buffer.alloc(44);
        
        // RIFF chunk descriptor
        wavHeader.write('RIFF', 0);
        wavHeader.writeUInt32LE(36, 4); // ChunkSize
        wavHeader.write('WAVE', 8);
        
        // fmt sub-chunk
        wavHeader.write('fmt ', 12);
        wavHeader.writeUInt32LE(16, 16); // Subchunk1Size
        wavHeader.writeUInt16LE(1, 20); // AudioFormat (PCM)
        wavHeader.writeUInt16LE(1, 22); // NumChannels (Mono)
        wavHeader.writeUInt32LE(16000, 24); // SampleRate
        wavHeader.writeUInt32LE(32000, 28); // ByteRate
        wavHeader.writeUInt16LE(2, 32); // BlockAlign
        wavHeader.writeUInt16LE(16, 34); // BitsPerSample
        
        // data sub-chunk
        wavHeader.write('data', 36);
        wavHeader.writeUInt32LE(0, 40); // Subchunk2Size
        
        // 4. Create audio data (1 second of 440Hz tone)
        console.log('Creating audio data...');
        const sampleRate = 16000;
        const duration = 1; // seconds
        const frequency = 440; // Hz (A4 note)
        const samples = sampleRate * duration;
        const audioData = Buffer.alloc(samples * 2);
        
        for (let i = 0; i < samples; i++) {
            const value = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 32767;
            audioData.writeInt16LE(Math.floor(value), i * 2);
        }
        
        // 5. Combine header and audio data
        const wavFile = Buffer.concat([wavHeader, audioData]);
        
        // 6. Save WAV file temporarily
        const wavPath = path.join(__dirname, 'test.wav');
        await fs.writeFile(wavPath, wavFile);
        console.log('Created test WAV file:', wavPath);
        
        // 7. Read the file and send to Deepgram
        console.log('\nSending audio to Deepgram...');
        const audioBuffer = await fs.readFile(wavPath);
        
        const source = {
            buffer: audioBuffer,
            mimetype: 'audio/wav'
        };
        
        console.log('Requesting transcription...');
        const transcription = await deepgram.transcription.preRecorded(source, {
            smart_format: true,
            punctuate: true,
            language: 'en',
            model: 'nova-2'
        });
        
        console.log('\nTranscription Response:');
        console.log(JSON.stringify(transcription, null, 2));
        
        // 8. Cleanup
        await fs.unlink(wavPath);
        console.log('\nTest complete. Cleaned up test file.');
        
    } catch (error) {
        console.error('\nError during test:');
        console.error('Name:', error.name);
        console.error('Message:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
        console.error('Stack:', error.stack);
    }
}

// Run the test
console.log('Starting Deepgram test...');
testDeepgramTranscription();
