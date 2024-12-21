const { createClient } = require("@deepgram/sdk");

async function testDeepgramTranscription() {
    try {
        console.log('\nDeepgram Official Test');
        console.log('=====================');

        // Initialize the Deepgram client with the API key
        const deepgramApiKey = "5a8ca7165c94026ff90c649306b6fa8f3a75daa2";
        console.log('Using API Key:', deepgramApiKey);

        const deepgram = createClient(deepgramApiKey);

        // Test with the official sample audio
        const url = "https://static.deepgram.com/examples/Bueller-Life-moves-pretty-fast.wav";
        console.log('\nTranscribing URL:', url);

        const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
            { url },
            { 
                smart_format: true, 
                model: 'nova-2', 
                language: 'en-US' 
            }
        );

        if (error) {
            console.error('\nTranscription Error:', error);
            throw error;
        }

        console.log('\nTranscription Result:');
        console.log('-------------------');
        if (result.results?.channels?.[0]?.alternatives?.[0]?.transcript) {
            console.log('Transcript:', result.results.channels[0].alternatives[0].transcript);
        }
        
        console.log('\nFull Response:');
        console.log('-------------');
        console.dir(result, { depth: null });

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
console.log('Starting official Deepgram test...');
testDeepgramTranscription();
