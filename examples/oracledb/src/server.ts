'use strict';

import { OracleInstrumentation } from '../../../packages/instrumentation-oracledb/src';
import { registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');

import {
    MeterProvider,
    MetricReader,
    PeriodicExportingMetricReader
} from '@opentelemetry/sdk-metrics';

const express = require('express');
const app = express();

const instrumentation = registerInstrumentationTesting(
  new OracleInstrumentation({ enhancedDatabaseReporting: true })
);
instrumentation.enable();
instrumentation.disable();

export const CONFIG = {
  user: process.env.ORACLE_USER,
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_CONNECTSTRING,
};

export const POOL_CONFIG = {
  ...CONFIG,
  poolMin: 2,
  poolMax: 5,
  poolIncrement: 1,
  poolTimeout: 5,
  stmtCacheSize: 23,
  queueTimeout:10000
};

import * as oracledb from 'oracledb';

let pool: oracledb.Pool

let conn: oracledb.Connection
const connects1 = [] as oracledb.Connection[]


app.get('/getConn', async (req: any, res: any) => {
    try{
        connects1.push(await pool.getConnection())
        res.send(`Got connection from pool`);
    }
    catch(err){
        if (!res.headersSent)
            res.status(500).json({
                'error':
                {
                    'code': (err as oracledb.DBError).code,
                    'message': (err as oracledb.DBError).message
                }
            }).end()
    }
})

app.get('/d', async (req: any, res: any) => {
    try {
        instrumentation.disable();
        res.send('Instrumentation disabled')
    }
    catch (err: unknown) {
        console.log(err)
    }

})

app.get('/connClose', async (req: any, res: any) => {
    try {
        if (connects1.length)
            conn = connects1.pop()!!

        await conn.close();
        
        res.send(`Conn closed from pool`);
    }
    catch (err) {
        if (!res.headersSent)
            res.status(500).json({
                'error':
                {
                    'code': (err as oracledb.DBError).code,
                    'message': (err as oracledb.DBError).message
                }
            }).end()
    }
})

app.get('/exe', async (req: any, res: any) => {
    try {
        if (connects1.length)
            conn = connects1.pop()!!
        else
            conn = await pool.getConnection();

        const sql = 'SELECT 1 from dual';
        await conn.execute(sql);
        await conn.close();
        
        res.send(`Executed sql from ${req.params.poolName} connection`);
    }
    catch (err) {
        if (!res.headersSent)
            res.status(500).json({
                'error':
                {
                    'code': (err as oracledb.DBError).code,
                    'message': (err as oracledb.DBError).message
                }
            }).end()
    }
})

app.get('/e', (req: any, res: any) => {
    instrumentation.enable();
    res.send('Instrumentation enabled')
})

app.get('/pclose', async (req: any, res: any) => {
    try {
        if (pool)
            await pool.close(0)
        res.send('Pool closed')
    }
    catch (err) {
        console.log((err as oracledb.DBError).code)
        res.send((err as oracledb.DBError).message)
    }
})


async function init() {
    const options = { port: 9464 };
    const exporter = new PrometheusExporter(options);

    const collectorOptions = {
        url: `${process.env.APM_DATA_UPLOAD_ENDPOINT}/20200101/opentelemetry/v1/metrics`,
        headers: { "Authorization": `dataKey ${process.env.APM_PRIVATE_DATA_KEY}` }
    };
    const metricExporter = new OTLPMetricExporter(collectorOptions);
    // Creates MeterProvider and installs the exporter as a MetricReader
    const otlpMetricReader = new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 100,
    });
    const meterProvider = new MeterProvider({
        readers: [exporter, otlpMetricReader],
    });

    // keep your instrumentation setup intact
    instrumentation.setMeterProvider(meterProvider);
    instrumentation.enable();

    pool = await oracledb.createPool({...POOL_CONFIG, poolAlias:'pool', enableStatistics:true})

    app.listen(7001, () => {
        console.log('server listening on port 7001..');
    })
}

init();
