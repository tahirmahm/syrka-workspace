import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test('every sample file downloads on desktop and the symbol fits mobile',async({page})=>{
 await page.goto('/workspace');await page.getByRole('button',{name:'Try demo — no account needed',exact:true}).click();
 await expect(page.locator('.sidebar .syrka-symbol')).toBeVisible();
 for(const [name,label,extension] of [['A fresh start','Download document (.html)','.html'],['Project budget','Download workbook (.syrka.json)','.syrka.json'],['The next chapter','Download PowerPoint (.pptx)','.pptx']]){
  await page.getByLabel(`Download ${name}`,{exact:true}).click();
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();const result=await pending;expect(result.suggestedFilename()).toBe(name+extension);const bytes=await readFile((await result.path())!);
  if(extension==='.html'){expect(bytes.toString()).toContain('A little space for big ideas');expect(bytes.toString()).toContain('<!doctype html>');}
  if(extension==='.syrka.json'){const backup=JSON.parse(bytes.toString());expect(backup.kind).toBe('sheet');expect(backup.content.sheets.sheet1.cellData[3][1].f).toBe('=SUM(B2:B3)');}
  if(extension==='.pptx')expect(bytes.subarray(0,2).toString()).toBe('PK');
 }
 await page.getByRole('button',{name:'Open A fresh start',exact:true}).click();await expect(page.locator('.tiptap')).toBeVisible();await page.locator('.tiptap').click();await page.keyboard.press('Control+End');await page.keyboard.type(' Unsaved download content.');await page.getByLabel('Download A fresh start',{exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download document (.html)',exact:true}).click();expect((await readFile((await (await pending).path())!)).toString()).toContain('Unsaved download content.');
 await page.getByRole('button',{name:'Back to files',exact:true}).click();await page.setViewportSize({width:390,height:844});await expect(page.locator('.sidebar .syrka-symbol')).toBeVisible();await expect(page.getByLabel('Download Project budget',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
