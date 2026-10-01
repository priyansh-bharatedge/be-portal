declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number | [number, number, number, number];
    filename?: string;
    image?: { type?: string; quality?: number };
    enableLinks?: boolean;
    html2canvas?: {
      scale?: number;
      useCORS?: boolean;
      letterRendering?: boolean;
      scrollY?: number;
      scrollX?: number;
      logging?: boolean;
    };
    jsPDF?: {
      unit?: string;
      format?: string | [number, number];
      orientation?: 'portrait' | 'landscape';
    };
    pagebreak?: {
      mode?: string | string[];
      before?: string | string[];
      after?: string | string[];
      avoid?: string | string[];
    };
  }

  interface Html2PdfWorker {
    set(opt: Html2PdfOptions): Html2PdfWorker;
    from(src: HTMLElement | string): Html2PdfWorker;
    save(): Promise<void>;
    outputPdf(type?: string): Promise<any>;
    toPdf(): Html2PdfWorker;
    get(type: string): Promise<any>;
  }

  function html2pdf(): Html2PdfWorker;
  function html2pdf(element: HTMLElement | string, opt?: Html2PdfOptions): Promise<void> | Html2PdfWorker;

  export default html2pdf;
}
