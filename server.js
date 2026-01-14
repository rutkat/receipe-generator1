const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const winston = require('winston');
const promClient = require('prom-client');

// Configure Winston logger with warning level
const logger = winston.createLogger({
    level: 'warning',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// Configure Prometheus metrics
const register = new promClient.Registry();

// Add default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// Create custom metrics
const httpRequestCounter = new promClient.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register]
});

const httpRequestDuration = new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [register]
});

const apiProxyCounter = new promClient.Counter({
    name: 'api_proxy_requests_total',
    help: 'Total number of API proxy requests',
    labelNames: ['status'],
    registers: [register]
});

const apiProxyErrorCounter = new promClient.Counter({
    name: 'api_proxy_errors_total',
    help: 'Total number of API proxy errors',
    registers: [register]
});

const app = express();
const PORT = 3000;
const API_URL = 'http://127.0.0.1:1234';

// Enable CORS for all routes
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON bodies
app.use(express.json());

// Middleware to track HTTP requests
app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        const route = req.route ? req.route.path : req.path;

        httpRequestCounter.inc({
            method: req.method,
            route: route,
            status_code: res.statusCode
        });

        httpRequestDuration.observe({
            method: req.method,
            route: route,
            status_code: res.statusCode
        }, duration);
    });

    next();
});

// Serve static files from current directory
app.use(express.static(__dirname));

// Serve index.html at root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Proxy route to forward requests to the API server
app.post('/api/chat/completions', async (req, res) => {
    try {
        const response = await fetch(`${API_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();

        if (!response.ok) {
            apiProxyCounter.inc({ status: 'error' });
            return res.status(response.status).json(data);
        }

        apiProxyCounter.inc({ status: 'success' });
        res.json(data);
    } catch (error) {
        apiProxyCounter.inc({ status: 'error' });
        apiProxyErrorCounter.inc();
        logger.warning('Proxy error:', error);
        res.status(500).json({ error: 'Failed to connect to API server', message: error.message });
    }
});

// Metrics endpoint for Prometheus scraping
app.get('/metrics', async (req, res) => {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (err) {
        res.status(500).end(err);
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Recipe Generator server running at http://localhost:${PORT}`);
    console.log(`Metrics available at http://localhost:${PORT}/metrics`);
    console.log(`Proxying API requests to ${API_URL}`);
    console.log('Press Ctrl+C to stop the server');
});
