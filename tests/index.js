const puppeteer = require('puppeteer');
const url = process.argv[2];
const numberOfTests = process.argv[3] || 100;

let choice;
if (process.argv[4]) {
    choice = parseInt(process.argv[4], 10);
} else {
    choice = 'random';
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testWithRandomCompletion(failRatio = 0.1) {
    console.log('initializing');
    const browser = await puppeteer.launch({headless: false});
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    const timeout = 5000;
    let experimentLength = 0;
    let counter = 0;

    try {
        console.log('starting');
        for (let i = 0; i < numberOfTests; i++) {
            let j = 0;
            counter++;
            console.log(`iteration ${counter}`);
            await page.goto(url);
            await page.waitForSelector('.jspsych-btn', {visible: true});
            await delay(100);

            // Click through the instructions
            while (await page.$(`#jspsych-instructions-next`) !== null) {
                console.log(`intro step ${++j}`);
                await page.waitForSelector(`#jspsych-instructions-next`, {timeout, visible: true});
                await page.click(`#jspsych-instructions-next`);
                await page.waitForNetworkIdle({waitUntil: 'domcontentloaded'});
                await delay(100);
            }

            await page.waitForSelector(`.jspsych-btn`, {timeout, visible: true});
            await page.waitForFunction(() => document.readyState === "complete");

            let l = 0;
            let interrupt = Math.floor(Math.random() * experimentLength / failRatio);
            // Click through the experiment
            while ((await page.$$(`.jspsych-btn`)).length > 0) {
                console.log(`main step ${++l}`);

                await page.waitForFunction(() => document.readyState === "complete");
                await delay(100);
                await page.waitForFunction(() => document.getElementsByClassName('jspsych-btn')[0].getAttribute('disabled') === null);

                const buttons = await page.$$(`.jspsych-btn`);
                if (choice === 'random') {
                    await buttons[Math.floor(Math.random() * buttons.length)].click();
                } else {
                    await buttons[Math.min(choice, buttons.length - 1)].click();
                }
                await page.waitForNetworkIdle({waitUntil: 'domcontentloaded'});

                if (interrupt && interrupt <= l) {
                    console.log('interrupting');
                    break;
                }
            }

            if (experimentLength === 0) {
                experimentLength = l;
            }
        }
    } catch (err) {
        console.log(err);
    } finally {
        await page.waitForNetworkIdle();
        await browser.close();
        console.log(`completed ${counter} iterations`);
    }
}

testWithRandomCompletion().then(() => {});
