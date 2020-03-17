const Apify = require('apify');

const { log } = Apify.utils;
const sourceUrl = 'https://gouvernement.lu/fr/dossiers.gouv_msan+fr+dossiers+2020+corona-virus.html#bloub-0';
const LATEST = 'LATEST';

Apify.main(async () => {
    const requestQueue = await Apify.openRequestQueue();
    const kvStore = await Apify.openKeyValueStore('COVID-19-LUXEMBOURG');
    const dataset = await Apify.openDataset('COVID-19-LUXEMBOURG-HISTORY');

    await requestQueue.addRequest({ url: sourceUrl });
    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        useApifyProxy: true,
        apifyProxyGroups: ['SHADER'],
        handlePageTimeoutSecs: 60 * 2,
        handlePageFunction: async ({ $ }) => {
            log.info('Page loaded.');
            const now = new Date();

            $('body strong').remove(); // remove bold title from confirmed cases
            const h3 = $('.table--container h3');
            const cases = $(h3[0]);
            const infected = parseInt(cases.text().match(/\d+/)[0], 10);
            const deceased = parseInt($(h3[1]).text().match(/\d+/)[0], 10);

            const data = {
                infected,
                deceased,
                sourceUrl,
                lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString()
                readMe: 'https://apify.com/tugkan/covid-lu',
            };

            // Compare and save to history
            const latest = await kvStore.getValue(LATEST) || {};
            delete latest.lastUpdatedAtApify;
            const actual = Object.assign({}, data);
            delete actual.lastUpdatedAtApify;

            await Apify.pushData({...data});

            if (JSON.stringify(latest) !== JSON.stringify(actual)) {
                log.info('Data did change :( storing new to dataset.');
                await dataset.pushData(data);
            }

            await kvStore.setValue(LATEST, data);
            log.info('Data stored, finished.');
        },

        // This function is called if the page processing failed more than maxRequestRetries+1 times.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed twice.`);
        },
    });

    // Run the crawler and wait for it to finish.
    await crawler.run();

    console.log('Crawler finished.');
});
