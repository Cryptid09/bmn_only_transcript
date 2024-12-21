require('dotenv').config();
const { Deepgram } = require('@deepgram/sdk');
const fs = require('fs').promises;
const path = require('path');

async function testDeepgramTranscription() {
    try {
        console.log('\nDeepgram Transcription Test');
        console.log('=========================');
        
        // 1. Check API Key
        if (!process.env.DEEPGRAM_API_KEY) {
            throw new Error('DEEPGRAM_API_KEY is not set in environment variables');
        }
        console.log('API Key:', process.env.DEEPGRAM_API_KEY);
        
        // 2. Initialize Deepgram
        console.log('\nInitializing Deepgram client...');
        const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
        
        // 3. Create a simple audio file using node
        console.log('\nCreating test audio buffer...');
        const sampleRate = 16000;
        const duration = 2; // seconds
        const frequency = 440; // Hz (A4 note)
        const audioBuffer = Buffer.alloc(sampleRate * duration * 2); // 16-bit audio
        
        // Fill buffer with a simple sine wave
        for (let i = 0; i < sampleRate * duration; i++) {
            const value = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 32767;
            audioBuffer.writeInt16LE(Math.floor(value), i * 2);
        }
        
        // 4. Send to Deepgram
        console.log('\nSending audio to Deepgram...');
        console.log('Audio buffer size:', audioBuffer.length, 'bytes');
        
        const response = await deepgram.transcription.preRecorded({
            buffer: audioBuffer,
            mimetype: 'audio/wav',
        }, {
            smart_format: true,
            punctuate: true,
            language: 'en',
        });
        
        // 5. Check response
        console.log('\nResponse received from Deepgram:');
        console.log(JSON.stringify(response, null, 2));
        
    } catch (error) {
        console.error('\nError during test:');
        console.error('Type:', error.constructor.name);
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
