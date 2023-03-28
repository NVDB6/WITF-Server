# WITF-Server

1. Install all dependencies: `npm install`
1. Find the prediction API keys for the classifiers in the Azure Console:
    - Azure Console > Resource Groups > myNVD2022 > NVDfridge-Prediction > Keys and Endpoint > KEY 1
1. Set the prediction API key as an environment variable:
    1. Mac/Linux:
        - `export PRED_KEY=<api_key>`
    1. Windows:
        - `set PRED_KEY=<api_key>`
1. Download the Firebase secret key file from Slack and move into root directory
1. Start server with:
    - `nodemon server.js` if in development
    - `node server.js` otherwise
1. Test server endpoint with `server_request_test.py`