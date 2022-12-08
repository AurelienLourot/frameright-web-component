import { html, css, LitElement, CSSResult, nothing, PropertyValues } from 'lit';
// eslint-disable-next-line no-unused-vars
import { property } from 'lit/decorators.js';
import {
  ImageRegionFromHtmlAttr,
  RectangleImageRegion,
} from './RectangleImageRegion.js';
import { SizeInPixels } from './SizeInPixels.js';

export class ImgFrameright extends LitElement {
  // Image region ID of the entire original image.
  private static readonly _IMAGE_REGION_ID_ORIGINAL = '<no region>';

  // Period in milliseconds for the component observer.
  private static readonly _OBSERVER_PERIOD_MS = 200;

  static styles: CSSResult = css`
    :host {
      /**
       * In order to behave like a replaced element (e.g. an <img>), see
       *   * https://developer.mozilla.org/en-US/docs/Web/CSS/display
       *   * https://developer.mozilla.org/en-US/docs/Web/CSS/Replaced_element
       */
      display: inline-block;

      /**
       * By default we want to follow the size of the parent container. This can
       * be shrinked by setting the 'width=' and 'height=' HTML attributes. See
       * willUpdate(). Or this can be overriden by setting an HTML attribute
       * like 'style="width: auto;"'.
       */
      width: 100%;
      height: 100%;

      overflow: hidden;
    }

    img {
      /* Prevents initial flickering. Will be set to 'visible' later when
         initial scaling has been calculated: */
      visibility: hidden;
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

  // Called whenever some properties (incl. HTML attributes) of the component
  // change.
  willUpdate(changedProperties: PropertyValues<this>) {
    // React to changes to the `image-regions=` HTML attribute:
    if (changedProperties.has('_imageRegions')) {
      this._populateRectangleImageRegions();
    }

    // React to changes to the `image-region-id=` HTML attribute:
    if (changedProperties.has('_imageRegionId')) {
      this._panAndZoomToBestFittingRegion();
    }

    // Translate `width=` and `height=` HTML attributes, which are designed for
    // replaced elements like `<img>`, into their CSS equivalent for the
    // root/host element.
    if (changedProperties.has('_width')) {
      this._getRootElementStyleObject().maxWidth = `${this._width}px`;
    }
    if (changedProperties.has('_height')) {
      this._getRootElementStyleObject().maxHeight = `${this._height}px`;
    }
  }

  render() {
    // Notes:
    // * On purpose we don't forward the `width=` and `height=` attributes down
    //   to the `<img>` element as this then messes with our calculated CSS
    //   scaling and moving. Instead we apply them to the root/host element's
    //   style inside willUpdate().
    // * On purpose we don't forward the `style=` attribute down to the `<img>`
    //   element as it's probably best applied to the root/host element only.
    //   (Thus we use `this._imgStyle` instead of `this._style` here.)
    return html`
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
        style=${this._imgStyle ?? nothing}
        tabindex=${this._tabindex ?? nothing}
        title=${this._title ?? nothing}
        translate=${this._translate ?? nothing}
      />
    `;
  }

  // Populates this._rectangleImageRegions based on this._imageRegions, passed
  // as HTML attribute. Doesn't trigger a re-rendering.
  private _populateRectangleImageRegions() {
    this._log('Populating rectangle image regions...');
    if (this._originalImageRegion.size.isUnknown()) {
      this._log('Natural image size unknown, deferring.');
      return;
    }

    this._rectangleImageRegions = [];
    this._imageRegions.forEach(region => {
      const rectangleImageRegion = new RectangleImageRegion();
      rectangleImageRegion.setFields(region, this._originalImageRegion.size);
      if (rectangleImageRegion.isUnknown()) {
        return;
      }

      if (region.absolute && this._srcset) {
        this._error('Do not use absolute regions together with srcset=');
      }

      this._log(
        `Rectangle region found: id=${rectangleImageRegion.id}, ` +
          `position=${rectangleImageRegion.position}, ` +
          `size=${rectangleImageRegion.size}`
      );
      this._rectangleImageRegions.push(rectangleImageRegion);
    });
  }

  // Called periodically in order to observe the size of the component and the
  // natural size of the image.
  //
  // We couldn't easily hook resize handlers both on the component's size and
  // the viewport's size, so instead we monitor them here. See
  // https://stackoverflow.com/questions/8082729/how-to-detect-css3-resize-events
  //
  // Note: When `srcset=` isn't used the natural size of the image never changes
  // and is the size of the image pointed at by `src=`. When `srcset=` is used
  // however, it follows the size of the viewport, so it can frequently change.
  // This is the base size to take into account when calculating the scaling
  // factor.
  private _observe() {
    let naturalSizeHasChanged = false;
    let componentSizeHasChanged = false;

    const imgElement = this.renderRoot.querySelector('img');
    if (imgElement) {
      const currentNaturalSize = new SizeInPixels(
        imgElement.naturalWidth,
        imgElement.naturalHeight
      );
      naturalSizeHasChanged =
        this._originalImageRegion.size.setIfDifferent(currentNaturalSize);
    }

    const currentComponentSize = new SizeInPixels(
      this.offsetWidth,
      this.offsetHeight
    );
    componentSizeHasChanged =
      this._currentComponentSize.setIfDifferent(currentComponentSize);

    if (naturalSizeHasChanged) {
      this._log(`Natural image size: ${this._originalImageRegion.size}`);
      this._populateRectangleImageRegions();
    }
    if (componentSizeHasChanged) {
      this._log(`Component size: ${this._currentComponentSize}`);
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
    this._log('Panning and zooming to best fitting region...');
    if (this._originalImageRegion.size.isUnknown()) {
      this._log('Natural image size unknown, deferring.');
      return;
    }

    const style = ['visibility: visible;'];

    // Avoid initial flickering by not having a transition when styling for the
    // first time:
    const firstTime = !this._imgStyle;
    if (!firstTime) {
      style.push(
        'transition: all',
        `${parseFloat(
          ((ImgFrameright._OBSERVER_PERIOD_MS * 1.5) / 1000).toFixed(3)
        )}s;`
      );
    }

    let bestRegion = null;
    if (this._imageRegionId) {
      // The user has manually selected an image region by ID via HTML
      // attribute, let's look for it:
      bestRegion = this._rectangleImageRegions.find(
        region => region.id === this._imageRegionId
      );
    }
    if (!bestRegion) {
      bestRegion = this._findBestFittingRegion();
    }

    if (ImgFrameright._IMAGE_REGION_ID_ORIGINAL === bestRegion.id) {
      style.push('width: 100%;', 'height: 100%;', 'object-fit: cover;');
    } else {
      const cssScaling = bestRegion.getCssScaling(
        this._currentComponentSize,
        this._originalImageRegion.size
      );
      style.push(
        `transform-origin: ${cssScaling.origin.getX()}px ${cssScaling.origin.getY()}px;`,
        `transform: translate(${-cssScaling.origin.getX()}px,`,
        `${-cssScaling.origin.getY()}px)`,
        `scale(${cssScaling.factor.toFixed(3)});`
      );
    }

    this._imgStyle = style.join(' ');
  }

  // Returns the image region that's the closest to the current component size.
  private _findBestFittingRegion(): RectangleImageRegion {
    // Determining the best fitting image region for the current component size.
    let bestRegion = this._originalImageRegion;
    if (!bestRegion.size.isUnknown()) {
      let smallestRatioDiff = this._currentComponentSize.ratioDiffFactor(
        this._originalImageRegion.size
      );

      // It's only worth looking for an image region if the component ratio and
      // the original image ratio differ enough:
      if (smallestRatioDiff > 1.1) {
        this._rectangleImageRegions.forEach(region => {
          const ratioDiff = this._currentComponentSize.ratioDiffFactor(
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
    return bestRegion;
  }

  // Returns the editable style object of the root/host element.
  private _getRootElementStyleObject() {
    let styleObject;
    if ('style' in this.renderRoot) {
      // HTMLElement
      styleObject = this.renderRoot.style;
    } else {
      // ShadowRoot
      styleObject = (this.renderRoot.host as HTMLElement).style;
    }
    return styleObject;
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
  @property({ attribute: 'style' }) _style = null;
  @property({ attribute: 'tabindex' }) _tabindex = null;
  @property({ attribute: 'title' }) _title = null;
  @property({ attribute: 'translate' }) _translate = null;

  // ImgFrameright-specific attributes:
  @property({ attribute: 'image-regions', type: Array })
  _imageRegions: ImageRegionFromHtmlAttr[] = [];
  @property({ attribute: 'image-region-id' }) _imageRegionId: string = '';
  @property({ attribute: 'debug', type: Boolean }) _debug: boolean = false;

  // Dynamically generated `<img style=` attribute whose main purpose is to pan
  // and zoom to a specific image region:
  @property() _imgStyle: string | null = null;

  // Special region representing the entire original image. Gets populated and
  // updated by _observe().
  private _originalImageRegion = new RectangleImageRegion(
    ImgFrameright._IMAGE_REGION_ID_ORIGINAL
  );

  // Sanitized version of this._imageRegions (passed as HTML attribute).
  // Populated by _populateRectangleImageRegions().
  private _rectangleImageRegions: RectangleImageRegion[] = [];

  // Interval observing the component in order to react to changes in size.
  private _observerIntervalId = 0;

  // Last observed size of the component in pixels. Populated by _observe().
  private _currentComponentSize = new SizeInPixels();
}
