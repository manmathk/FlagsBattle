# Custom soundtrack

Drop one audio file here (`.mp3`, `.ogg`, `.m4a` or `.wav`) and it becomes the
soundtrack, replacing the generated score. Remove it and the generated score
comes back. If several files are present the first by filename is used.

The file is picked up by a build-time glob, so **rebuild after adding one**.

Tracks live here rather than in `public/` on purpose: static hosting has no
directory listing, so detecting a file under `public/` would mean probing for
guessed filenames and eating a 404 on every page load. Resolving it at build time
costs nothing at runtime.

Only add audio you have the rights to distribute — whatever is in this folder is
bundled into the deployed site.
