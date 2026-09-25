import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  stages: [
    { duration: '15s', target: __ENV.TARGET_VUS }, 
    { duration: '30s', target: __ENV.TARGET_VUS },  
    { duration: '15s', target: 0 },                
  ],
};

export default function () {
  const url = 'https://markdaniel0702.github.io/MIRC-2026-Interactive-Intramuros-Food-Map-Guide/';
  const res = http.get(url);
  check(res, {
    'is status 200': (r) => r.status === 200,
  });
  sleep(1);
}
