import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const dir='arbiter-capture';
await mkdir(dir,{recursive:true});
const origin='http://127.0.0.1:4173';
const provenance={sourceCommit:'ea098e4837eb7c7c3c2365e844900a21aaa7aef4',captureCommit:process.env.GITHUB_SHA,viewport:{width:1600,height:900},sourceData:'Bundled synthetic fixtures only',shots:[],actions:[],requests:[],pageErrors:[]};
let browser,context;
const server=spawn('node',['server.mjs'],{stdio:'inherit',env:{...process.env,CHANGERECEIPT_PORT:'4173'}});
try{
 for(let i=0;i<100;i++){try{if((await fetch(origin)).ok)break;}catch{} await new Promise(r=>setTimeout(r,200));if(i===99)throw Error('Server not ready');}
 browser=await chromium.launch();
 context=await browser.newContext({viewport:provenance.viewport,recordVideo:{dir,size:provenance.viewport},serviceWorkers:'block'});
 const page=await context.newPage();
 const started=performance.now(); const stamp=()=>+((performance.now()-started)/1000).toFixed(3);
 page.on('request',r=>provenance.requests.push(r.url()));page.on('pageerror',e=>provenance.pageErrors.push(e.message));
 const hold=ms=>page.waitForTimeout(ms);
 const action=name=>provenance.actions.push({name,seconds:stamp()});
 const shot=async(name,ms=12000)=>{await page.screenshot({path:`${dir}/${name}.png`});provenance.shots.push({name,seconds:stamp()});await hold(ms);};
 const frame=async(selector)=>{await page.locator(selector).first().evaluate(el=>el.scrollIntoView({block:'start',behavior:'smooth'}));await hold(1000);};
 const click=async(locator,name)=>{await locator.hover();await hold(500);action(name);await locator.click();await hold(800);};
 await page.goto(origin);await shot('01-empty',8000);
 await click(page.getByRole('button',{name:'Load synthetic example',exact:true}),'load-example');
 await expect(page.getByText('handoff-before.csv',{exact:true})).toBeVisible();
 await shot('02-sources',12000);
 await click(page.getByRole('button',{name:'Map columns',exact:true}),'map-columns');
 await expect(page.getByLabel('Before ID column',{exact:true})).toHaveValue('');
 action('select-before-id');await page.getByLabel('Before ID column',{exact:true}).selectOption({label:'Asset ID'});await hold(1000);
 action('select-after-id');await page.getByLabel('After ID column',{exact:true}).selectOption({label:'Inventory ID'});await shot('03-identifiers',10000);
 await click(page.getByRole('button',{name:'Map same-named fields',exact:true}),'map-same-fields');
 for(const [index,label,before,after] of [[3,'Item','Item','Description'],[4,'Location','Location','Storage']]){
  await click(page.getByRole('button',{name:'Add a field',exact:true}),`add-field-${index}`);
  await page.getByLabel(`Field ${index} label`,{exact:true}).fill(label);
  await page.getByLabel(`Field ${index} before column`,{exact:true}).selectOption({label:before});await hold(700);
  await page.getByLabel(`Field ${index} after column`,{exact:true}).selectOption({label:after});await hold(700);
 }
 await frame('.field-heading');await shot('04-field-mapping',14000);
 await click(page.getByRole('button',{name:'Compare snapshots',exact:true}),'compare');
 await expect(page.getByRole('heading',{name:'A record of the handoff.'})).toBeVisible();await shot('05-review-summary',14000);
 await click(page.locator('details.entry').filter({has:page.locator('.entry-key',{hasText:/^0002$/})}).locator('summary'),'open-count-change');
 await frame('details.entry[open]');await expect(page.locator('details.entry[open] .changes-table')).toContainText('Count');await shot('06-count-change',15000);
 await page.locator('details.entry[open] > summary').click();
 await click(page.locator('details.entry').filter({has:page.locator('.entry-key',{hasText:/^0003$/})}).locator('summary'),'open-location-change');
 await frame('details.entry[open]');await shot('07-location-change',12000);
 await click(page.getByRole('button',{name:/^1 Ambiguous IDs$/}),'filter-ambiguity');
 await click(page.locator('details.entry-ambiguous > summary'),'open-ambiguity');await frame('details.entry-ambiguous');
 await expect(page.locator('.entry-ambiguous')).toContainText('2 before / 1 after records. No match chosen.');await shot('08-duplicate-group',16000);
 await click(page.getByRole('button',{name:/^2 Missing IDs$/}),'filter-missing');
 await click(page.locator('details.entry-invalid-key > summary').first(),'open-missing-id');await frame('.entries');await shot('09-missing-ids',12000);
 await click(page.getByRole('button',{name:'All results',exact:true}),'all-results');
 await click(page.locator('details.scope > summary'),'open-scope');await frame('details.scope');await shot('10-comparison-scope',12000);
 await click(page.locator('details.evidence-source > summary').first(),'open-original-evidence');await frame('details.evidence-source');await shot('11-source-evidence',14000);
 await frame('.receipt-export');await shot('12-export-before',4000);
 const downloadPromise=page.waitForEvent('download');await click(page.getByRole('button',{name:'Download full receipt',exact:true}),'download-receipt');
 const download=await downloadPromise;await download.saveAs(`${dir}/changereceipt-synthetic.json`);
 const receipt=JSON.parse(await readFile(`${dir}/changereceipt-synthetic.json`,'utf8'));
 assert.deepEqual(receipt.comparison.summary,{added:1,removed:1,changed:2,unchanged:2,ambiguous:1,invalidKey:2});assert.equal(receipt.comparison.complete,false);
 for(const side of ['before','after']){const original=await readFile(`public/fixtures/handoff-${side}.csv`);assert.equal(receipt.sources[side].originalBase64,original.toString('base64'));assert.equal(receipt.sources[side].sha256,createHash('sha256').update(original).digest('hex'));}
 provenance.receiptSummary=receipt.comparison.summary;
 await shot('13-export-complete',12000);
 await click(page.getByRole('button',{name:/Your snapshots/}),'return-to-sources');
 action('rejected-replacement');await page.getByLabel('Replace before CSV',{exact:true}).setInputFiles({name:'malformed-example.csv',mimeType:'text/csv',buffer:Buffer.from('ID,Name\n001,"Unclosed\n')});
 await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByText('handoff-before.csv',{exact:true})).toBeVisible();await frame('.step-content');await shot('14-original-kept-after-error',12000);
 await click(page.getByRole('button',{name:'Start over',exact:true}),'start-over');await shot('15-reset',8000);
 assert.equal(provenance.pageErrors.length,0);assert.ok(provenance.requests.every(u=>new URL(u).origin===origin));
 const video=page.video();await context.close();context=undefined;await video.saveAs(`${dir}/changereceipt-real-browser.webm`);
 provenance.verifierOutput=execFileSync('node',['--experimental-strip-types','receipt-verifier/cli.mjs',`${dir}/changereceipt-synthetic.json`],{encoding:'utf8'});
 await writeFile(`${dir}/verifier-output.txt`,provenance.verifierOutput);provenance.success=true;
}catch(error){provenance.success=false;provenance.error=String(error);throw error;}
finally{if(context)await context.close();if(browser)await browser.close();server.kill('SIGTERM');await writeFile(`${dir}/provenance.json`,JSON.stringify(provenance,null,2));}
