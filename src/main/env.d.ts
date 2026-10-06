// Vite's ?raw import: the file's text as a string (used for scope-inpage.js).
declare module '*?raw' {
  const content: string
  export default content
}
