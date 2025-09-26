const { Cluster } = require('puppeteer-cluster');
const express = require('express');

let servedRequests = 0;
let errorCount = 0;

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Health check endpoint for Heroku
app.get('/', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        message: 'Crawly Render Server is running',
        servedRequests,
        errorCount
    });
});

// Function to log server stats
const logServerStats = () => {
    console.log(`Served Requests: ${servedRequests}`);
    console.log(`Error Count: ${errorCount}`);
};

// Log server stats every minute (60,000 milliseconds)
setInterval(logServerStats, 60000);

// Define your launch options here
const launchOptions = {
    headless: "new",
    args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-first-run',
        '--no-zygote',
        '--deterministic-fetch',
        '--disable-features=IsolateOrigins',
        '--disable-site-isolation-trials',
        '--single-process',
        '--memory-pressure-off',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
    ],
};

// Set Chrome executable path for Heroku
if (process.env.CHROME_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.CHROME_EXECUTABLE_PATH;
} else {
    // Default Chrome path for Heroku
    launchOptions.executablePath = '/usr/bin/google-chrome';
}

let max_concurrency = 1; // Reduced for Heroku memory constraints
if (process.env.MAX_CONCURRENCY) {
    max_concurrency = parseInt(process.env.MAX_CONCURRENCY, 10);
  };

(async () => {
    let cluster;
    try {
        console.log('Starting Puppeteer cluster with options:', JSON.stringify(launchOptions, null, 2));
        console.log('Max concurrency:', max_concurrency);
        
        // Create a cluster with N workers
        cluster = await Cluster.launch({
            concurrency: Cluster.CONCURRENCY_CONTEXT,
            maxConcurrency: max_concurrency,
            puppeteerOptions: launchOptions,
        });
        
        console.log('Puppeteer cluster started successfully');
        
        // Test Chrome executable
        const fs = require('fs');
        const chromePath = launchOptions.executablePath;
        if (fs.existsSync(chromePath)) {
            console.log('Chrome executable found at:', chromePath);
        } else {
            console.error('Chrome executable NOT found at:', chromePath);
        }
        
    } catch (error) {
        console.error('Failed to start Puppeteer cluster:', error);
        process.exit(1);
    }

    // Define a task
    cluster.task(async ({ page, data: {url, headers} }) => {
        const startTime = Date.now();
        if (headers) {
            for (const [name, value] of Object.entries(headers)) {
                await page.setExtraHTTPHeaders({ [name]: value });
            }
        }
        const response = await page.goto(url, {timeout: 60000});
        const status_code = response.status()
        // const pageBody = await page.evaluate(() => document.body.innerHTML);
        const finalUrl = page.url();
        const pageBody = await page.content()
        const endTime = Date.now();
        const loadTime = endTime - startTime;
        let url_string = "'" + url + "'"
        if(finalUrl != url)
            url_string = "'" + url + "' -> '" + finalUrl + "'"
        tpl = `[DEBUG] Fetched ${url_string} status: ${status_code} (${loadTime/1000}s)`
        console.log(tpl)
        servedRequests++;
        return {page: pageBody, status: status_code, headers: response.headers()};
    });

    // Define a route for receiving URLs via POST requests
    app.post('/render', async (req, res) => {
        const { url, headers } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL parameter is required.' });
        }

        try {
            const result = await cluster.execute({url, headers});
            res.status(200).json(result);
        } catch (err) {
            errorCount++;
            console.error("[ERROR] Could not get '" + url + "' Error:", err.message);
            console.error("Full error:", err);
            res.status(500).json({ 
                error: 'An error occurred while processing the URL.',
                message: err.message,
                url: url
            });
        }
    });

    // Start the Express server
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });

    // Shutdown the cluster and close Express server on process termination
    process.on('SIGINT', async () => {
        await cluster.idle();
        await cluster.close();
        process.exit();
    });
})();
