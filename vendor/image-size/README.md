# Metro compatibility for image-size 2

Metro 0.83 calls image-size synchronously with either bytes or a local asset
filename. Version 2.0.3 contains the ICNS/JXL/HEIF parser security fixes but
removed the filename overload. This adapter reads the file, then delegates
all parsing to the unchanged upstream package via an npm alias.

No decoder code is copied. Remove this adapter when the Expo/Metro upgrade
uses the current image-size API. The adapter does not implement the old
callback-based API, which this Metro version does not use.
