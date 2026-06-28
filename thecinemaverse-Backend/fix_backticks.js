const fs = require('fs');
const file = 'c:/Users/BYTEIQ/Documents/Ollypidea/Ollypedia-Backend/server.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/return \\`<!-- ════════════════════════════════════════════════════════════════/g, 'return `<!-- ════════════════════════════════════════════════════════════════');
content = content.replace(/\\`;\n}/g, '`;\n}');
content = content.replace(/movieUrl}" style="color:#c9973a;text-decoration:underline;">\${movieName} Main Page<\/a>.\n  <\/p>\n<\/section>\n\n\${relatedMovies.length \? \\`/g, 'movieUrl}" style="color:#c9973a;text-decoration:underline;">${movieName} Main Page</a>.\n  </p>\n</section>\n\n${relatedMovies.length ? `');
content = content.replace(/movieUrl}" style="color:#10b981;text-decoration:underline;">\${movieName} Main Page<\/a>.\n  <\/p>\n<\/section>\n\n\${relatedMovies.length \? \\`/g, 'movieUrl}" style="color:#10b981;text-decoration:underline;">${movieName} Main Page</a>.\n  </p>\n</section>\n\n${relatedMovies.length ? `');
content = content.replace(/movieUrl}" style="color:#ff9800;text-decoration:underline;">\${movieName} Main Page<\/a>.\n  <\/p>\n<\/section>\n\n\${relatedMovies.length \? \\`/g, 'movieUrl}" style="color:#ff9800;text-decoration:underline;">${movieName} Main Page</a>.\n  </p>\n</section>\n\n${relatedMovies.length ? `');
// Just globally replace `\\\`` with `\``
content = content.replace(/\\`/g, '`');

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed backticks syntax error');
