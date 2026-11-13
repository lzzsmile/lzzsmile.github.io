// Browser-test navigation uses only the calendar's remaining visible controls.
import assert from 'node:assert/strict';
export const selectedDate=page=>page.evaluate(()=>new URLSearchParams(location.hash.split('?')[1]).get('date'));
export const visibleMonth=async page=>(await page.locator('.calendar-day').first().getAttribute('data-date')).slice(0,7);
export async function browseMonth(page,value){
 if(await page.locator('.calendar-toggle').getAttribute('aria-expanded')==='false')await page.locator('.calendar-toggle').click();
 for(let count=0;count<1200;count++){
  const current=await visibleMonth(page);if(current===value)return;
  const arrow=page.locator(`[data-action="month-${current>value?'prev':'next'}"]`);
  assert.equal(await arrow.isDisabled(),false,'requested month must be reachable');await arrow.click();
 }
 throw Error('Calendar traversal exceeded 1200 months');
}
export async function chooseDate(page,value){
 const compact=await page.locator('.calendar-toggle').getAttribute('aria-expanded')==='false';
 if(!await page.locator(`.calendar-day[data-date="${value}"]`).count())await browseMonth(page,value.slice(0,7));
 await page.locator(`.calendar-day[data-date="${value}"]`).click();
 if(compact&&await page.locator('.calendar-toggle').getAttribute('aria-expanded')==='true')await page.locator('.calendar-toggle').click();
 assert.equal(await selectedDate(page),value);
}
