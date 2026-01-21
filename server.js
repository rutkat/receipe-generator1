const fastify = require('fastify')({ logger: false });
const path = require('path');
const fetch = require('node-fetch');
const winston = require('winston');
const promClient = require('prom-client');
const fastifyCors = require('@fastify/cors');
const fastifyStatic = require('@fastify/static');

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

const PORT = 3000;
const API_URL = 'http://127.0.0.1:1234';

// Register plugins
async function start() {
    // Enable CORS for all routes
    await fastify.register(fastifyCors, {
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    });

    // Register static file serving
    await fastify.register(fastifyStatic, {
        root: __dirname,
        prefix: '/'
    });

    // Add hooks for metrics tracking
    fastify.addHook('onRequest', async (request, reply) => {
        request.metricsStart = Date.now();
    });

    fastify.addHook('onResponse', async (request, reply) => {
        const duration = (Date.now() - request.metricsStart) / 1000;
        const route = request.routerPath || request.raw.url;

        httpRequestCounter.inc({
            method: request.method,
            route: route,
            status_code: reply.statusCode
        });

        httpRequestDuration.observe({
            method: request.method,
            route: route,
            status_code: reply.statusCode
        }, duration);
    });

    // Serve index.html at root route
    fastify.get('/', async (request, reply) => {
        return reply.sendFile('index.html');
    });

    // Proxy route to forward requests to the API server
    fastify.post('/api/chat/completions', async (request, reply) => {
        try {
            const response = await fetch(`${API_URL}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request.body)
            });

            const data = await response.json();

            if (!response.ok) {
                apiProxyCounter.inc({ status: 'error' });
                return reply.status(response.status).send(data);
            }

            apiProxyCounter.inc({ status: 'success' });
            return reply.send(data);
        } catch (error) {
            apiProxyCounter.inc({ status: 'error' });
            apiProxyErrorCounter.inc();
            logger.warn('Proxy error:', error);
            return reply.status(500).send({ error: 'Failed to connect to API server', message: error.message });
        }
    });

    // Metrics endpoint for Prometheus scraping
    fastify.get('/metrics', async (request, reply) => {
        try {
            reply.header('Content-Type', register.contentType);
            return await register.metrics();
        } catch (err) {
            return reply.status(500).send(err);
        }
    });

    // Start server
    try {
        await fastify.listen({ port: PORT });
        console.log(`Recipe Generator server running at http://localhost:${PORT}`);
        console.log(`Metrics available at http://localhost:${PORT}/metrics`);
        console.log(`Proxying API requests to ${API_URL}`);
        console.log('Press Ctrl+C to stop the server');
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}

start();
