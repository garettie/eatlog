# Eatlog website

This directory holds the static website and the Markdown sources for Privacy, Terms, and Support. The served HTML versions live in the matching route directories. Keep each Markdown and HTML pair in sync when editing.

From this directory, run `python3 -m http.server 4173` and open `http://127.0.0.1:4173/`. The site bundles its fonts and images. It has no analytics, forms, or remote font requests.

From the repository root, run `npm run site:check` before every deploy. It fails if any page carries `noindex`, a draft marker, or a missing effective date, and it checks the plan copy, screenshots, and security headers. Privacy and Terms are version 1.3, effective September 24, 2026.

The September 24 owner screenshots now fill the homepage's Today, Add, review, Diary, weight, calorie, and consistency positions. Each source was 810 by 1800 pixels; the website crop removes the top 80 pixels, leaving 810 by 1720 without the status bar. Responsive aliases are 405 by 860. The final image in story step 04 remains `planscreen3.jpg`/`planscreen3-405.jpg` at the owner's request.
