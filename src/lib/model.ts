export type FileKind='doc'|'sheet'|'slides';
export type Element={id:string;type:'text'|'shape'|'image';x:number;y:number;w:number;h:number;text:string;color:string;fontSize:number;asset?:string};
export type Slide={id:string;background:string;elements:Element[]};
export type OfficeFile={id:string;owner_id:string;name:string;kind:FileKind;content:Record<string,unknown>;updated_at:string;starred:boolean};
// Presentation names are separate from persisted kind IDs for backwards compatibility.
export const suiteName = 'Syrka Workspace';
export const products = {
  write: { name: 'Write', fullName: 'Syrka Write', label: 'Document', color: '#4775cc', description: 'Give your ideas a voice.' },
  tables: { name: 'Tables', fullName: 'Syrka Tables', label: 'Spreadsheet', color: '#36816a', description: 'Make sense of every number.' },
  present: { name: 'Present', fullName: 'Syrka Present', label: 'Presentation', color: '#cf764c', description: 'Bring your story to life.' },
  create: { name: 'Create', fullName: 'Syrka Create', label: 'Creative and design tools', color: '#8b68ac', description: 'Make space for your imagination.' },
} as const;
// Create has no editor in this MVP. Only implemented editors are launchable.
export const apps = { doc: products.write, sheet: products.tables, slides: products.present };
export function newSlide():Slide{return {id:crypto.randomUUID(),background:'#f5f2eb',elements:[{id:crypto.randomUUID(),type:'text',x:90,y:150,w:760,h:120,text:'Your next big idea',color:'#173f35',fontSize:52}]};}
export function initialContent(kind:FileKind,sample=false):Record<string,unknown>{if(kind==='doc')return {type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:sample?'A little space for big ideas':'Untitled document'}]},{type:'paragraph',content:[{type:'text',text:sample?'Welcome to Syrka Workspace. This is where a thought becomes a plan. Write, explore, and make something that matters.':'Start writing your story…'}]}]};if(kind==='slides')return {slides:[newSlide()]};return {id:crypto.randomUUID(),name:sample?'Project budget':'Workbook',sheetOrder:['sheet1'],sheets:{sheet1:{id:'sheet1',name:'Sheet 1',rowCount:1000,columnCount:26,cellData:sample?{0:{0:{v:'Category'},1:{v:'Budget'},2:{v:'Actual'}},1:{0:{v:'Design'},1:{v:5000},2:{v:4200}},2:{0:{v:'Development'},1:{v:12000},2:{v:11400}},3:{0:{v:'Total'},1:{f:'=SUM(B2:B3)'},2:{f:'=SUM(C2:C3)'}}}:{}}}};}
export function makeFile(kind:FileKind,owner='demo',sample=false):OfficeFile{return {id:crypto.randomUUID(),owner_id:owner,name:sample?({doc:'A fresh start',sheet:'Project budget',slides:'The next chapter'}[kind]):`Untitled ${apps[kind].label.toLowerCase()}`,kind,content:initialContent(kind,sample),updated_at:new Date().toISOString(),starred:false};}
export function download(data:BlobPart,name:string,type:string){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
