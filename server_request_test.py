import os
import requests
import time

directory = './dataset'
for test_dir in os.listdir(directory):
    print(f"Testing {test_dir}")
    images = dict()
    for filename in os.listdir(os.path.join(directory, test_dir)):
        path = os.path.join(directory, test_dir, filename)
        images[filename] = open(path, 'rb')
    response = requests.post("http://localhost:3000/upload-images", files=images)
    print(response.status_code, response.text)
    time.sleep(1) # TODO: Remove for demo, only because we're running tests back to back