const fs = require('fs');

const headHtml = fs.readFileSync('c:\\Users\\NevanDeeZ\\Desktop\\modcluster-main\\src\\client\\modpulse.html', 'utf8');
const oldHtml = fs.readFileSync('c:\\Users\\NevanDeeZ\\Desktop\\modcluster-main\\scratch\\old_modpulse2.html', 'utf8');

const oldColLeftMatch = oldHtml.match(/<div class="colLeft">([\s\S]*?)<\/div>\s*<div class="colRight">/);
const oldColRightMatch = oldHtml.match(/<div class="colRight">([\s\S]*?)<\/div>\s*<\/main>/);

if (!oldColLeftMatch || !oldColRightMatch) {
  console.error('Could not find colLeft or colRight in old HTML');
  process.exit(1);
}

let oldColLeft = oldColLeftMatch[1];
let oldColRight = oldColRightMatch[1];

const styleMatches = [...headHtml.matchAll(/<div class="card"\s*style="([^"]+)"\s*id="([^"]+)">/g)];
const stylesMap = {};
for (const match of styleMatches) {
  stylesMap[match[2]] = match[1];
}

const cardTitleStyleMatch = headHtml.match(/<div class="cardTitle"\s*style="([^"]+)">/);
const cardTitleStyle = cardTitleStyleMatch ? cardTitleStyleMatch[1] : '';

const cardSubStyleMatch = headHtml.match(/<div class="cardSub"\s*style="([^"]+)">/);
const cardSubStyle = cardSubStyleMatch ? cardSubStyleMatch[1] : '';

const btnGhostStyleMatch = headHtml.match(/<button class="btn btnGhost"\s*style="([^"]+)"/);
const btnGhostStyle = btnGhostStyleMatch ? btnGhostStyleMatch[1] : '';

oldColLeft = oldColLeft.replace(/<section class="card"/g, `<section class="card" style="${stylesMap['handoverCard'] || ''}"`);
oldColRight = oldColRight.replace(/<section class="card" id="juryCard"/g, `<section class="card" style="${stylesMap['juryCard'] || ''}" id="juryCard"`);
oldColRight = oldColRight.replace(/<section class="card activityCard"/g, `<section class="card activityCard" style="${stylesMap['activityCard'] || ''}"`);
oldColLeft = oldColLeft.replace(/<section class="card" id="healthCard"/g, `<section class="card" style="${stylesMap['healthCard'] || ''}" id="healthCard"`);

oldColLeft = oldColLeft.replace(/<div class="cardTitle">/g, `<div class="cardTitle" style="${cardTitleStyle}">`);
oldColLeft = oldColLeft.replace(/<div class="cardSub">/g, `<div class="cardSub" style="${cardSubStyle}">`);
oldColLeft = oldColLeft.replace(/<button class="btn btnGhost"/g, `<button class="btn btnGhost" style="${btnGhostStyle}"`);

oldColRight = oldColRight.replace(/<div class="cardTitle">/g, `<div class="cardTitle" style="${cardTitleStyle}">`);
oldColRight = oldColRight.replace(/<div class="cardSub">/g, `<div class="cardSub" style="${cardSubStyle}">`);
oldColRight = oldColRight.replace(/<button class="btn btnGhost"/g, `<button class="btn btnGhost" style="${btnGhostStyle}"`);

const newHtml = headHtml.replace(
  /<section class="colLeft">[\s\S]*?<\/section>\s*<section class="colRight">[\s\S]*?<\/section>/,
  `<section class="colLeft">${oldColLeft}</section>\n\n        <section class="colRight">${oldColRight}</section>`
);

fs.writeFileSync('c:\\Users\\NevanDeeZ\\Desktop\\modcluster-main\\src\\client\\modpulse.html', newHtml);
console.log('HTML successfully patched!');
