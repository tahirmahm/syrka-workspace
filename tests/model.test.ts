import {describe,it,expect} from 'vitest';
import {makeFile,initialContent,newSlide} from '../src/lib/model';
describe('document models',()=>{
it('creates independent, owned files with valid JSON',()=>{const first=makeFile('doc','user-a');const second=makeFile('doc','user-b');expect(first.id).not.toBe(second.id);expect(first.owner_id).toBe('user-a');expect(JSON.parse(JSON.stringify(first)).content.type).toBe('doc');});
it('seeds a real workbook formula and sheet ordering',()=>{const content=initialContent('sheet',true);expect(content.sheetOrder).toEqual(['sheet1']);expect(content.sheets).toMatchObject({sheet1:{cellData:{3:{1:{f:'=SUM(B2:B3)'}}}}});});
it('starts slides with an editable element within a 960 × 540 canvas',()=>{const slide=newSlide();for(const el of slide.elements){expect(el.x+el.w).toBeLessThanOrEqual(960);expect(el.y+el.h).toBeLessThanOrEqual(540);expect(el.type).toBe('text');}});
});
