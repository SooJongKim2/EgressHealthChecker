import React, { useState, useEffect, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, TimeScale } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { format } from 'date-fns';
import io from 'socket.io-client';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, TimeScale);
const socket = io('http://health-check-1990274319.ap-northeast-2.elb.amazonaws.com', {
  path: '/socket.io'
});

// 데이터 decimation 함수
function decimateData(data, maxPoints) {
  if (data.length <= maxPoints) return data;
  
  const factor = Math.floor(data.length / maxPoints);
  return data.filter((_, index) => index % factor === 0);
}

function App() {
  const [data, setData] = useState({
    datasets: [
      { label: 'ICMP', data: [], borderColor: 'red', fill: false },
      { label: 'TCP', data: [], borderColor: 'blue', fill: false },
      { label: 'UDP', data: [], borderColor: 'green', fill: false },
      { label: 'HTTP', data: [], borderColor: 'purple', fill: false },
      { label: 'HTTPS', data: [], borderColor: 'orange', fill: false },
    ],
  });

  const [noResponseLogs, setNoResponseLogs] = useState({});

  const updateData = useCallback((protocol, result) => {
    setData(prevData => {
      const newTimestamp = new Date(result.timestamp * 1000);
      const newDatasets = prevData.datasets.map(dataset => {
        if (dataset.label === protocol) {
          return { 
            ...dataset, 
            data: [...dataset.data, { x: newTimestamp, y: result.success ? result.response_time : 0 }],
            pointBackgroundColor: [...(dataset.pointBackgroundColor || []), result.success ? dataset.borderColor : 'red'],
            pointRadius: [...(dataset.pointRadius || []), result.success ? 3 : 5],
          };
        }
        return dataset;
      });

      // Check for no response
      const currentDataset = newDatasets.find(ds => ds.label === protocol);
      const lastPoint = currentDataset.data[currentDataset.data.length - 1];
      
      setNoResponseLogs(prevLogs => {
        const newLogs = { ...prevLogs };
        if (lastPoint.y === 0) {
          if (!newLogs[protocol]) {
            newLogs[protocol] = { start: newTimestamp, end: newTimestamp };
          } else {
            newLogs[protocol].end = newTimestamp;
          }
        } else if (newLogs[protocol]) {
          delete newLogs[protocol];
        }
        return newLogs;
      });

      // Decimate data if it exceeds 1000 points
      if (currentDataset.data.length > 1000) {
        return {
          datasets: newDatasets.map(dataset => ({
            ...dataset,
            data: decimateData(dataset.data, 1000),
            pointBackgroundColor: dataset.pointBackgroundColor ? decimateData(dataset.pointBackgroundColor, 1000) : undefined,
            pointRadius: dataset.pointRadius ? decimateData(dataset.pointRadius, 1000) : undefined,
          }))
        };
      }

      return { datasets: newDatasets };
    });
  }, []);

  useEffect(() => {
    socket.on('icmp_result', result => updateData('ICMP', result));
    socket.on('tcp_result', result => updateData('TCP', result));
    socket.on('udp_result', result => updateData('UDP', result));
    socket.on('http_result', result => updateData('HTTP', result));
    socket.on('https_result', result => updateData('HTTPS', result));

    return () => {
      socket.off('icmp_result');
      socket.off('tcp_result');
      socket.off('udp_result');
      socket.off('http_result');
      socket.off('https_result');
    };
  }, [updateData]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    stacked: false,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'EgressHealthChecker' },
      tooltip: {
        callbacks: {
          title: function(context) {
            return format(new Date(context[0].parsed.x), 'yyyy-MM-dd HH:mm:ss');
          },
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += context.parsed.y === 0 ? 'FAIL' : context.parsed.y.toFixed(2) + ' ms';
            }
            return label;
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'second',
          displayFormats: {
            second: 'HH:mm:ss'
          }
        },
        ticks: {
          maxTicksLimit: 10,
        },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        beginAtZero: true,
        title: {
          display: true,
          text: 'Response Time (ms)'
        },
      },
    },
  };

  return (
    <div className="App" style={{height: '100vh', display: 'flex', flexDirection: 'column'}}>
      <h1>Egress Communication Test</h1>
      <div style={{flex: 1}}>
        <Line data={data} options={options} />
      </div>
      <div>
        <h2>No Response Logs</h2>
        <ul>
          {Object.entries(noResponseLogs).map(([protocol, log]) => (
            <li key={protocol}>{`${protocol}: No response from ${format(log.start, 'HH:mm:ss')} to ${format(log.end, 'HH:mm:ss')}`}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default App;