import { Dialog as Primitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
export function Dialog({ open, onOpenChange, title, children, wide = false }: {open: boolean; onOpenChange:(v:boolean)=>void; title:string; children:ReactNode; wide?:boolean}) {
  return <Primitive.Root open={open} onOpenChange={onOpenChange}>
    <Primitive.Portal><Primitive.Backdrop className="ca-dialog-backdrop"/>
      <Primitive.Popup className={`ca-dialog ${wide?'ca-dialog-wide':''}`}>
        <div className="ca-dialog-head"><Primitive.Title>{title}</Primitive.Title><Primitive.Close className="ca-button ca-button-ghost ca-button-icon" aria-label="Close dialog"><X size={19}/></Primitive.Close></div>
        <div className="ca-dialog-content">{children}</div>
      </Primitive.Popup>
    </Primitive.Portal>
  </Primitive.Root>;
}
