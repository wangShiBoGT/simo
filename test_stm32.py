import serial
import time

result = ""
try:
    result += "Opening COM5...\n"
    s = serial.Serial('COM5', 115200, timeout=2)
    time.sleep(1)
    s.reset_input_buffer()
    
    result += "Sending PING...\n"
    s.write(b'PING\n')
    time.sleep(0.5)
    
    response = s.read(200)
    if response:
        result += "Response: " + repr(response) + "\n"
    else:
        result += "No response\n"
    
    s.close()
except Exception as e:
    result += "Error: " + str(e) + "\n"

with open('test_result.txt', 'w') as f:
    f.write(result)
print(result)
