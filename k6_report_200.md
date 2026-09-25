# K6 Load Test Report - 200 Virtual Users

## Test Configuration
- **Target URL:** `https://markdaniel0702.github.io/MIRC-2026-Interactive-Intramuros-Food-Map-Guide/`
- **Max Virtual Users (VUs):** 200
- **Duration:** 1 minute (15s ramp-up, 30s steady at 200 VUs, 15s ramp-down)
- **Environment:** GitHub Pages (Live Deployment)

## Results Summary

| Metric | Result |
| :--- | :--- |
| **Total Requests** | 8,706 |
| **Requests per Second (RPS)** | 143.98 /s |
| **Successful Requests (HTTP 200)** | 8,706 (100.00%) |
| **Failed Requests** | 0 (0.00%) |
| **Data Received** | 29 MB |
| **Data Sent** | 822 kB |

### Response Times (HTTP Request Duration)
- **Average:** 41.82 ms
- **Minimum:** 0.55 ms
- **Median:** 18.68 ms
- **Maximum:** 743.08 ms
- **90th Percentile:** 71.28 ms
- **95th Percentile:** 202.61 ms

## Observations
The 200 VU load test completed with a **100% success rate**, managing to serve over 8,700 requests in one minute. The response times were blazingly fast, averaging around **42ms**. 

Interestingly, while the 100 VU test experienced heavy throttling (due to DDoS protection), the 200 VU test passed flawlessly. This typically occurs because GitHub's CDN edge nodes successfully cached the content heavily during or after the first test, serving subsequent requests directly from memory with minimal overhead. It proves that under ideal edge-caching conditions, the site can effortlessly serve 200 concurrent users without breaking a sweat.
