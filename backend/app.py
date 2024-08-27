import os
from flask import Flask, render_template
from flask_socketio import SocketIO
import requests
import socket
from icmplib import ping
import time
import threading
from flask_cors import CORS



app = Flask(__name__)
CORS(app)
# socketio = SocketIO(app)
socketio = SocketIO(app, cors_allowed_origins="*")  # CORS 설정 추가
# 외부 서버 정보 (변수로 쉽게 선언)
EXTERNAL_SERVER = {
    'ip': '3.35.168.160',
    'tcp_port': 80,
    'udp_port': 53,
    'http_url': 'http://3.35.168.160',
    'https_url': 'https://3.35.168.160',
}

def test_icmp():
    while True:
        start_time = time.time()
        try:
            result = ping(EXTERNAL_SERVER['ip'], count=1, timeout=2)
            success = result.is_alive
            response_time = result.avg_rtt
        except Exception:
            success = False
            response_time = 0
        end_time = time.time()
        socketio.emit('icmp_result', {'success': success, 'timestamp': end_time, 'response_time': response_time})
        time.sleep(1)

def test_tcp():
    while True:
        start_time = time.time()
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2)
            result = sock.connect_ex((EXTERNAL_SERVER['ip'], EXTERNAL_SERVER['tcp_port']))
            success = (result == 0)
            sock.close()
        except Exception:
            success = False
        end_time = time.time()
        response_time = (end_time - start_time) * 1000  # Convert to milliseconds
        socketio.emit('tcp_result', {'success': success, 'timestamp': end_time, 'response_time': response_time})
        time.sleep(1)

def test_udp():
    while True:
        start_time = time.time()
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(2)
            sock.sendto(b'', (EXTERNAL_SERVER['ip'], EXTERNAL_SERVER['udp_port']))
            data, _ = sock.recvfrom(1024)
            success = len(data) > 0
            sock.close()
        except Exception:
            success = False
        end_time = time.time()
        response_time = (end_time - start_time) * 1000  # Convert to milliseconds
        socketio.emit('udp_result', {'success': success, 'timestamp': end_time, 'response_time': response_time})
        time.sleep(1)

def test_http():
    while True:
        start_time = time.time()
        try:
            response = requests.get(EXTERNAL_SERVER['http_url'], timeout=2)
            success = response.status_code == 200
        except Exception:
            success = False
        end_time = time.time()
        response_time = (end_time - start_time) * 1000  # Convert to milliseconds
        socketio.emit('http_result', {'success': success, 'timestamp': end_time, 'response_time': response_time})
        time.sleep(1)

def test_https():
    while True:
        start_time = time.time()
        try:
            response = requests.get(EXTERNAL_SERVER['https_url'], timeout=2, verify=False)
            success = response.status_code == 200
            end_time = time.time()
            response_time = (end_time - start_time) * 1000 if success else None
        except Exception:
            success = False
            response_time = None
        socketio.emit('https_result', {'success': success, 'timestamp': time.time(), 'response_time': response_time})
        time.sleep(1)
@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    threading.Thread(target=test_icmp, daemon=True).start()
    threading.Thread(target=test_tcp, daemon=True).start()
    threading.Thread(target=test_udp, daemon=True).start()
    threading.Thread(target=test_http, daemon=True).start()
    threading.Thread(target=test_https, daemon=True).start()
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)