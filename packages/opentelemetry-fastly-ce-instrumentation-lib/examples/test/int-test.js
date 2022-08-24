const fetch = require('node-fetch');
const expect = require('chai').expect;

'use strict';


(async function () {

    describe('Verify example setup', function () {

        let traceId;

        context('Get traceid from intrumented application', function () {
            before(async function () {
                let response = await fetch('http://localhost');
                traceId = (await response.json()).traceid;
            });

            it('valid traceid returned', function () {
                expect(traceId).to.match(/^[0-9,a-f]{32,32}$/i);
            });
        });

        context('Get trace id from Jaeger', function () {
            
            let jaegerResponse;
            
            before(async function () {
                await wait(1000);
                let response = await fetch('http://localhost:16686/api/traces/' + traceId);
                jaegerResponse = await response.json();
            });

            it('matching trace id', function () {
                expect(jaegerResponse.data[0].traceID).to.equal(traceId);
                expect(jaegerResponse.data[0].spans).to.have.length(3);
            });
            it('three spans', function () {
                expect(jaegerResponse.data[0].spans).to.have.length(3);
            });
            it('correct service name', function () {
                expect(jaegerResponse.data[0].processes.p1.serviceName).to.equal('compute@edge-example');
            });            
        });


    });


})();


const wait = async function(intTimeMs) {
    await new Promise(resolve => setTimeout(resolve, intTimeMs));
}
