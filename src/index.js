const https = require("https");
const http = require("http");
const net = require("net");
const { hrtime } = process;
const AWS = require("aws-sdk");
const cloudwatch = new AWS.CloudWatch();

const hrToMs = (timing) => Math.round(timing[0] * 1000 + timing[1] / 1000000);
const hrDiff = (start, end) => hrToMs(end) - hrToMs(start);
const timingsDiff = (timings, key1, key2) => (timings[key1] && timings[key2] && hrDiff(timings[key1], timings[key2])) || -1;
const defaultTimeout = 2000;

const processTimings = (timings) => {
    return {
        lookup: timingsDiff(timings, "start", "lookup"),
        connect: timingsDiff(timings, "lookup", "connect"), 
        secureConnect: timingsDiff(timings, "connect", "secureConnect"),
        readable: timingsDiff(timings, "secureConnect", "readable") || timingsDiff(timings, "connect", "readable"),
        close: timingsDiff(timings, "readable", "close"),
        total: timingsDiff(timings, "start", "close")
    }
};

const createRequest = (url, callback) => {
    const handler = url.startsWith("http://") ? http : https
    return handler.get(url, callback)
};

const sendData = (data, event) => Promise.all(
    data.reduce((acc, metric) => {
        let arr = acc[acc.length - 1];
        if (!arr || arr.length >= 10) {
            acc.push([metric]);
        } else {
            arr.push(metric);
        }
        return acc;
    }, [])
    .map(metricData => cloudwatch.putMetricData({
        Namespace: event.namespace || "Watchtower",
        MetricData: metricData
    }).promise())
);

const handlers = {}

/**
 * Query HTTP(S) Endpoints and log timings and HTTP status with CloudWatch
 * 
 * @param {Object} event - Requested checks
 * @param {Object[]} event.targets - Endpoints to be checked
 * @param {string} [event.targets[].url] - Endpoint URL - use for http(s) endpoints
 * @param {string} [event.targets[].hostname] - Endpoint Hostname - use for non-http(s) endpoints
 * @param {string} [event.targets[].name] - Endpoint Name
 * @param {string} [event.targets[].type] - Check type - can be "http(s)" or "port". Defaults to "http(s)"
 * @param {string[]} [event.logTimings=["readable", "total"]] - Determine which timings are logged.
 * @param {string} [event.namespace="Watchtower"] - CloudWatch namespace
 * @param {number} [event.timeout=2000] - Time in ms before requests are aborted.
 * 
 * @returns {Promise} - Promise that resolves if all checks were successful and data was stored in CloudWatch
 */
exports.handler = async (event) => {
    console.log('Event=', JSON.stringify(event));
    const targets = event.targets;
    if (!targets) {
        return "No targets given";
    }

    const requests = targets.map(target => new Promise((resolve, reject) => {
        const data = {
            name: target.name || target.url,
            timings: { start: hrtime() },
        }
        handlers.http(target, data, event, resolve, reject);
    }));
    
    try {
        const results = await Promise.all(requests);
        const timestamp = new Date();
        const includedTimings = event.logTimings || ["readable", "total"];
        const metricData = results.map(result => {
            const timingMetrics = includedTimings.map(timing => {
                return {
                    MetricName: `timing-${timing}`,
                    Dimensions: [{Name: result.name, Value: `Timing: ${timing}`}],
                    Value: result.durations[timing],
                    Unit: "Milliseconds",
                    Timestamp: timestamp
                };
            })
            return [{
                MetricName: "status",
                Dimensions: [{ Name: result.name, Value: "HTTP Status" }],
                Value: result.statusCode,
                Timestamp: timestamp,
            }, ...timingMetrics]
        }).reduce((acc, val) => [...acc, ...val], []);

        console.log('Sending metrics to CloudWatch', JSON.stringify(metricData));
        return sendData(metricData, event);
    } catch (err) {
        console.log('Error', err);
        return err;
    }
};

/*
Check handler for HTTP(S)
*/
handlers.http = (target, data, event, resolve, reject) => {
    console.log('Sending http request to', target.url);
    const request = createRequest(target.url, response => {
        data.statusCode = response.statusCode;
        response.once("readable", () => data.timings.readable = hrtime());
        response.once("end", () => data.timings.end = hrtime());
    });
    request.setTimeout(1);
    const timeout = setTimeout(() => request.abort(), event.timeout || defaultTimeout);
    request.on("socket", socket => {
        socket.on("lookup", () => data.timings.lookup = hrtime());
        socket.on("connect", () => data.timings.connect = hrtime());
        socket.on("secureConnect", () => data.timings.secureConnect = hrtime());
    });
    request.on("close", () => {
        data.timings.close = hrtime();
        console.log('Request finished');
        data.durations = processTimings(data.timings);
        clearTimeout(timeout);
        resolve(data);
    });
    request.on("error", () => {
        data.timings.close = hrtime();
        console.log('Got error from http request');
        data.durations = processTimings(data.timings);
        data.statusCode = typeof data.statusCode !== "undefined" ? data.statusCode : 0;
        clearTimeout(timeout);
        resolve(data);
    });
};
