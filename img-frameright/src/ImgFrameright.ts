import { html, css, LitElement, CSSResult, nothing, PropertyValues } from 'lit';
import { property } from 'lit/decorators.js';
import { PositionInPixels } from './PositionInPixels.js';
import { SizeInPixels } from './SizeInPixels.js';

interface ImageRegion {
  id?: string;
  shape?: string;
  absolute?: boolean;
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
}

interface RectangleImageRegion {
  id: string;
  position: PositionInPixels;
  size: SizeInPixels;
}

export class ImgFrameright extends LitElement {
  // Image region ID of the entire original image.
  private static readonly _IMAGE_REGION_ID_ORIGINAL = '__orig__';

  // Period in milliseconds for the component observer.
  private static readonly _OBSERVER_PERIOD_MS = 200;

  static styles: CSSResult = css`
    div.root {
      width: 100%;
      height: 100%;
      position: relative;
    }

    img {
      /* Prevents initial flickering. Will be set to 'visible' later when
         initial scaling has been calculated: */
      visibility: hidden;

      transition: all
        ${parseFloat(
          ((ImgFrameright._OBSERVER_PERIOD_MS * 1.5) / 1000).toFixed(3)
        )}s;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this._observerIntervalId ||= window.setInterval(() => {
      this._observe();
    }, ImgFrameright._OBSERVER_PERIOD_MS);
  }

  disconnectedCallback() {
    if (this._observerIntervalId) {
      window.clearInterval(this._observerIntervalId);
      this._observerIntervalId = 0;
    }
    super.disconnectedCallback();
  }

  // Called whenever some properties change. We use this opportunity to populate
  // this._rectangleImageRegions based on this._imageRegions.
  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('_imageRegions')) {
      this._populateRectangleImageRegions();
    }
  }

  render() {
    // Notes:
    //
    // * Instead of duplicating here again the full list of HTML attributes
    //   we used to generate it in an earlier version of this code and render it
    //   with:
    //
    //      return unsafeHTML(`<div class="root"><img ${htmlAttrs} /></div>`);
    //
    //   However this led to Lit deleting and re-creating the elements, so the
    //   CSS `transition: ` styles had no effect and everything was flickering.
    //
    // * On purpose we don't forward the `width=` and `height=` attributes down
    //   to the `<img>` element as this then messes with our calculated CSS
    //   scaling and moving.
    return html`
      <div class="root">
        <img
          alt=${this._alt ?? nothing}
          crossorigin=${this._crossorigin ?? nothing}
          decoding=${this._decoding ?? nothing}
          fetchpriority=${this._fetchpriority ?? nothing}
          ?ismap=${this._ismap}
          loading=${this._loading ?? nothing}
          referrerpolicy=${this._referrerpolicy ?? nothing}
          sizes=${this._sizes ?? nothing}
          src=${this._src ?? nothing}
          srcset=${this._srcset ?? nothing}
          usemap=${this._usemap ?? nothing}
          class=${this._class ?? nothing}
          contextmenu=${this._contextmenu ?? nothing}
          dir=${this._dir ?? nothing}
          enterkeyhint=${this._enterkeyhint ?? nothing}
          ?hidden=${this._hidden}
          inert=${this._inert ?? nothing}
          is=${this._is ?? nothing}
          itemid=${this._itemid ?? nothing}
          itemprop=${this._itemprop ?? nothing}
          itemref=${this._itemref ?? nothing}
          ?itemscope=${this._itemscope}
          itemtype=${this._itemtype ?? nothing}
          lang=${this._lang ?? nothing}
          nonce=${this._nonce ?? nothing}
          part=${this._part ?? nothing}
          role=${this._role ?? nothing}
          spellcheck=${this._spellcheck ?? nothing}
          style=${this._style ?? nothing}
          tabindex=${this._tabindex ?? nothing}
          title=${this._title ?? nothing}
          translate=${this._translate ?? nothing}
        />
      </div>
    `;
  }

  // Calculates the difference between two image ratios, expressed as the
  // factor >= 1, so that one ratio multiplied by this factor gives the other
  // ratio.
  private static _imageRatioDiffFactor(
    firstSize: SizeInPixels,
    secondSize: SizeInPixels
  ) {
    const firstRatio = firstSize.getRatio(); // > 0
    const secondRatio = secondSize.getRatio(); // > 0
    return firstRatio >= secondRatio
      ? firstRatio / secondRatio
      : secondRatio / firstRatio;
  }

  // Hydrates this._originalImageRegion. Doesn't trigger a re-rendering.
  private _populateOriginalImageRegion() {
    this._log('Populating original image region...');

    if (this._currentNaturalSize.isUnknown()) {
      this._log('<img> not fully rendered yet, deferring.');
      return;
    }

    this._originalImageRegion.size = this._currentNaturalSize;
    this._log(`original image size: ${this._originalImageRegion.size}px`);
  }

  // Populates this._rectangleImageRegions based on this._imageRegions, passed
  // as HTML attribute. Doesn't trigger a re-rendering.
  private _populateRectangleImageRegions() {
    this._log('Populating rectangle image regions...');
    if (this._originalImageRegion.size.isUnknown()) {
      this._log('Original image size unknown, deferring.');
      return;
    }

    this._rectangleImageRegions = [];
    this._imageRegions.forEach(region => {
      if (
        region.shape == null ||
        region.absolute == null ||
        region.x == null ||
        region.y == null ||
        region.width == null ||
        region.height == null
      ) {
        return;
      }

      if (region.shape.toLowerCase() !== 'rectangle') {
        return;
      }

      let x: number = parseFloat(`${region.x}`);
      let y: number = parseFloat(`${region.y}`);
      let width: number = parseFloat(`${region.width}`);
      let height: number = parseFloat(`${region.height}`);
      if (
        Number.isNaN(x) ||
        Number.isNaN(y) ||
        Number.isNaN(width) ||
        Number.isNaN(height)
      ) {
        return;
      }
      if (x < 0 || y < 0 || width <= 0 || height <= 0) {
        return;
      }

      if (region.absolute) {
        if (this._srcset) {
          this._error('Do not use absolute regions together with srcset=');
        }
      } else {
        x *= this._originalImageRegion.size.getWidth();
        y *= this._originalImageRegion.size.getHeight();
        width *= this._originalImageRegion.size.getWidth();
        height *= this._originalImageRegion.size.getHeight();
      }

      const id: string = region.id ?? window.crypto.randomUUID();
      const position = new PositionInPixels(x, y);
      const size = new SizeInPixels(width, height);

      this._log(
        `rectangle region found: id=${id}, position=${position}, size=${size}`
      );
      this._rectangleImageRegions.push({
        id,
        position,
        size,
      });
    });
  }

  // Called periodically in order to observe the size of the component and
  // the natural size of the image (useful when using `srcset=`).
  // See https://stackoverflow.com/questions/8082729/how-to-detect-css3-resize-events
  private _observe() {
    let naturalSizeHasChanged = false;
    let componentSizeHasChanged = false;

    const imgElement = this.renderRoot.querySelector('img');
    if (imgElement) {
      const currentNaturalSize = new SizeInPixels(
        imgElement.naturalWidth,
        imgElement.naturalHeight
      );
      if (!currentNaturalSize.equals(this._currentNaturalSize)) {
        this._currentNaturalSize = currentNaturalSize;
        naturalSizeHasChanged = true;
      }
    }

    const currentComponentSize = new SizeInPixels(
      this.offsetWidth,
      this.offsetHeight
    );
    if (!currentComponentSize.equals(this._currentComponentSize)) {
      this._currentComponentSize = currentComponentSize;
      componentSizeHasChanged = true;
    }

    if (naturalSizeHasChanged) {
      this._populateOriginalImageRegion();
      this._populateRectangleImageRegions();
    }
    if (naturalSizeHasChanged || componentSizeHasChanged) {
      this._panAndZoomToBestFittingRegion();
    }
  }

  // Applies dynamically some CSS style to the <img> element. This couldn't be
  // done in pure CSS, see
  // https://stackoverflow.com/questions/50248577/css-transform-scale-based-on-container-width
  //
  // Note: it will automatically triggers a re-rending as it touches the <img>
  // element's `style=` HTML attribute.
  private _panAndZoomToBestFittingRegion() {
    const style = ['visibility: visible;'];

    // Determining the best fitting image region for the current component size.
    let bestRegion = this._originalImageRegion;
    if (!bestRegion.size.isUnknown()) {
      // nothing we can do if this hasn't been set
      let smallestRatioDiff = ImgFrameright._imageRatioDiffFactor(
        this._currentComponentSize,
        this._originalImageRegion.size
      );

      // It's only worth looking for an image region if the component ratio and
      // the original image ratio differ enough:
      if (smallestRatioDiff > 1.1) {
        this._rectangleImageRegions.forEach(region => {
          const ratioDiff = ImgFrameright._imageRatioDiffFactor(
            this._currentComponentSize,
            region.size
          );
          if (ratioDiff < smallestRatioDiff) {
            smallestRatioDiff = ratioDiff;
            bestRegion = region;
          }
        });
      }
    }

    this._log(`Selected region: ${bestRegion.id}`);

    if (ImgFrameright._IMAGE_REGION_ID_ORIGINAL === bestRegion.id) {
      style.push('width: 100%;', 'height: 100%;', 'object-fit: cover;');
    } else {
      const regionX = bestRegion.position.getX();
      const regionY = bestRegion.position.getY();
      const regionWidth = bestRegion.size.getWidth();
      const regionHeight = bestRegion.size.getHeight();
      const componentWidth = this._currentComponentSize.getWidth();
      const componentHeight = this._currentComponentSize.getHeight();

      // Note: it took a lot of trial and error to figure out the proper
      // formula to calculate the image offset, also used as origin of the
      // scale transformation.
      let xOffset = 0;
      let yOffset = 0;
      let scaleFactor = 1;
      if (this._currentComponentSize.getRatio() < bestRegion.size.getRatio()) {
        scaleFactor = componentWidth / regionWidth;
        yOffset = Math.round(
          (componentHeight / scaleFactor - regionHeight) / 2
        );
      } else {
        scaleFactor = componentHeight / regionHeight;
        xOffset = Math.round((componentWidth / scaleFactor - regionWidth) / 2);
      }

      style.push(
        'position: absolute;',
        `left: ${-regionX + xOffset}px;`,
        `top: ${-regionY + yOffset}px;`,
        `transform-origin: ${regionX - xOffset}px ${regionY - yOffset}px;`,
        `transform: scale(${scaleFactor.toFixed(3)});`
      );
    }

    this._style = style.join(' ');
  }

  private _log(text: string) {
    if (this._debug) {
      // eslint-disable-next-line no-console
      console.log(this._id ? `[${this._id}] ${text}` : text);
    }
  }

  private _error(text: string) {
    if (this._debug) {
      // eslint-disable-next-line no-console
      console.error(this._id ? `[${this._id}] ${text}` : text);
    }
  }

  // All <img>-specific HTML attributes, see
  // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img
  @property({ attribute: 'alt' }) _alt = null;
  @property({ attribute: 'crossorigin' }) _crossorigin = null;
  @property({ attribute: 'decoding' }) _decoding = null;
  @property({ attribute: 'fetchpriority' }) _fetchpriority = null;
  @property({ attribute: 'height' }) _height = null;
  @property({ attribute: 'ismap' }) _ismap = null;
  @property({ attribute: 'loading' }) _loading = null;
  @property({ attribute: 'referrerpolicy' }) _referrerpolicy = null;
  @property({ attribute: 'sizes' }) _sizes = null;
  @property({ attribute: 'src' }) _src: string | null = null;
  @property({ attribute: 'srcset' }) _srcset = null;
  @property({ attribute: 'width' }) _width = null;
  @property({ attribute: 'usemap' }) _usemap = null;

  // Relevant global HTML attributes, see
  // https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes
  @property({ attribute: 'class' }) _class = null;
  @property({ attribute: 'contextmenu' }) _contextmenu = null;
  @property({ attribute: 'dir' }) _dir = null;
  @property({ attribute: 'enterkeyhint' }) _enterkeyhint = null;
  @property({ attribute: 'hidden' }) _hidden = null;
  @property({ attribute: 'id' }) _id = null;
  @property({ attribute: 'inert' }) _inert = null;
  @property({ attribute: 'is' }) _is = null;
  @property({ attribute: 'itemid' }) _itemid = null;
  @property({ attribute: 'itemprop' }) _itemprop = null;
  @property({ attribute: 'itemref' }) _itemref = null;
  @property({ attribute: 'itemscope' }) _itemscope = null;
  @property({ attribute: 'itemtype' }) _itemtype = null;
  @property({ attribute: 'lang' }) _lang = null;
  @property({ attribute: 'nonce' }) _nonce = null;
  @property({ attribute: 'part' }) _part = null;
  @property({ attribute: 'role' }) _role = null;
  @property({ attribute: 'spellcheck' }) _spellcheck = null;
  @property({ attribute: 'style' }) _style: string | null = null;
  @property({ attribute: 'tabindex' }) _tabindex = null;
  @property({ attribute: 'title' }) _title = null;
  @property({ attribute: 'translate' }) _translate = null;

  // ImgFrameright-specific attributes:
  @property({ attribute: 'image-regions', type: Array })
  _imageRegions: ImageRegion[] = [];
  @property({ attribute: 'debug', type: Boolean }) _debug: boolean = false;

  private _originalImageRegion: RectangleImageRegion = {
    id: ImgFrameright._IMAGE_REGION_ID_ORIGINAL,
    position: new PositionInPixels(0, 0),

    // This field will be populated by _populateOriginalImageRegion() based
    // on _currentNaturalSize.
    size: new SizeInPixels(),
  };

  // Sanitized version of this._imageRegions (passed as HTML attribute).
  // Populated by _populateRectangleImageRegions().
  private _rectangleImageRegions: RectangleImageRegion[] = [];

  // Interval observing the component in order to react to changes in size.
  private _observerIntervalId = 0;

  // Last observed size of the component in pixels. Populated by _observe().
  private _currentComponentSize = new SizeInPixels();

  // Last observed natural size of the rendered image in pixels. Populated by
  // _observe(). When `srcset=` isn't used this never changes and is the size of
  // the image pointed at by `src=`. When `srcset=` is used however, it follows
  // the size of the viewport, so it can frequently change. This is the base
  // size to take into account when calculating the scaling factor.
  private _currentNaturalSize = new SizeInPixels();
}
