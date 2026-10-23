import Lightbox from 'yet-another-react-lightbox';
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';

export default function ImageLightbox({ image, title, onClose }: { image: string; title: string; onClose: () => void }) {
  return <Lightbox
    open
    close={onClose}
    slides={[{ src: image, alt: title }]}
    plugins={[Zoom, Fullscreen]}
    carousel={{ finite: true }}
    controller={{ closeOnBackdropClick: true }}
    zoom={{ maxZoomPixelRatio: 5, scrollToZoom: true }}
  />;
}
