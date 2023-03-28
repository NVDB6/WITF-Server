import os
import requests
import time

directory = './dataset'
for test_dir in os.listdir(directory):
    if test_dir != ".DS_Store":
        images = dict()
        print(f"Testing {test_dir}")
        for filename in os.listdir(os.path.join(directory, test_dir)):
            if filename != ".DS_Store":
                path = os.path.join(directory, test_dir, filename)
                images[filename] = open(path, 'rb')
        print(time.time())
        response = requests.post("http://localhost:3000/upload-images", files=images)
        print(response.status_code, response.text)
        time.sleep(1) # TODO: Remove for demo, only because we're running tests back to back