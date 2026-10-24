# Third-party notices

OpenPrintText application code is licensed under the MIT license in `LICENSE`.
The following assets are distributed under their own licenses, which are
included without replacing or relicensing them.

| Component | Version / source | Included license |
| --- | --- | --- |
| opentype.js | 1.3.4, published npm package / https://github.com/opentypejs/opentype.js | `dist/vendor/opentype.LICENSE` (MIT) |
| tiny-inflate | 1.0.3, included in the opentype.js distribution | `dist/vendor/tiny-inflate-1.0.3.LICENSE` |
| string.prototype.codepointat | 0.2.1, included in the opentype.js distribution | `dist/vendor/string.prototype.codepointat-0.2.1.LICENSE` (MIT) |
| DejaVu Sans | Unmodified font bytes from the system DejaVu font distribution / https://dejavu-fonts.github.io/ | `dist/assets/FONT_LICENSE.txt` (Bitstream Vera terms; DejaVu changes public domain) |

The demo font is encoded as base64 in `dist/assets/demo-font.js` so that the
tool works without fetching fonts from a third-party service, including when
opened directly from disk. This representation does not change the font data.

The standalone HTML builder embeds all of the above license text together with
the project's MIT license. User-selected fonts are not added to this repository
or distributed by this project. Users remain responsible for the rights needed
for their own fonts and intended use.
