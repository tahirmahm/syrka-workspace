import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
const variants = cva('inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-800 disabled:opacity-50 disabled:pointer-events-none', {variants:{variant:{default:'bg-[#111111] text-white hover:bg-[#303030]',outline:'border border-stone-200 bg-white hover:bg-stone-50',ghost:'hover:bg-stone-100'},size:{default:'h-10 px-4',sm:'h-8 px-3',icon:'size-9'}},defaultVariants:{variant:'default',size:'default'}});
export function Button({className,variant,size,asChild=false,...props}:React.ComponentProps<'button'> & VariantProps<typeof variants> & {asChild?:boolean}) {const Comp=asChild?Slot:'button'; return <Comp className={cn(variants({variant,size,className}))} {...props}/>;}
