# K6 Load Test Report - 100 Virtual Users

## Test Configuration
- **Target URL:** `https://markdaniel0702.github.io/MIRC-2026-Interactive-Intramuros-Food-Map-Guide/`
- **Max Virtual Users (VUs):** 100
- **Duration:** 1 minute (15s ramp-up, 30s steady at 100 VUs, 15s ramp-down)
- **Environment:** GitHub Pages (Live Deployment)

## Results Summary

| Metric | Result |
| :--- | :--- |
| **Total Requests** | 744 |
| **Requests per Second (RPS)** | 10.26 /s |
| **Successful Requests (HTTP 200)** | 503 (67.60%) |
| **Failed Requests** | 241 (32.39%) |
| **Data Received** | 2.3 MB |
| **Data Sent** | 223 kB |

### Response Times (HTTP Request Duration)
- **Average:** 4.10 s
- **Minimum:** 0 s
- **Median:** 113.53 ms
- **Maximum:** 1m 0s
- **90th Percentile:** 4.94 s
- **95th Percentile:** 39.31 s

## Observations
During the 100 VU load test, the GitHub Pages infrastructure exhibited rate-limiting and connection throttling. About **32.4%** of the requests failed with TCP connection resets and timeouts (`A connection attempt failed because the connected party did not properly respond`). This is typical behavior when load testing static sites on GitHub Pages, as they have built-in DDoS protection that drops excessive rapid connections from a single IP address.

This indicates that while the server can handle normal traffic, aggressive traffic spikes from a single source will be heavily throttled.
