const { unfurl } = require('unfurl.js');
const { selectAll } = require('unist-util-select');

// eslint-disable-next-line no-unused-vars
module.exports = async ({ markdownAST }, _pluginOptions) => {
  const links = selectAll('paragraph link:only-child', markdownAST);

  console.log('before!!!!!!!!!');
  console.dir(markdownAST, { depth: 10 });
  await Promise.all(
    links.map((link) => unfurlFromLink(link))
  );
  console.log('after!!!!!!!!!');
  console.dir(markdownAST, { depth: 10 });
};

const unfurlFromLink = async (linkNode) => {
  const { url } = linkNode;
  const metadata = extractLinkMetadata(await unfurl(url));
  metadata.url = url;

  console.dir(metadata, { depth: 4 });

  return convertLinkToCardElement(linkNode, metadata);
};

const extractLinkMetadata = (metadata) => ({
  title:
      metadata.twitter_card?.title
      ?? metadata.open_graph?.title
      ?? metadata.title,
  description:
      metadata.twitter_card?.description
      ?? metadata.open_graph?.description
      ?? metadata.description,
  video: metadata.open_graph?.videos?.[0] || undefined,
  image:
      metadata.twitter_card?.images?.[0]
      || metadata.open_graph?.images?.[0]
      || undefined,
  logo: metadata.favicon,
  site:
      metadata.oEmbed?.provider_name
      || metadata.open_graph?.site_name
      || metadata.twitter_card?.site
      || undefined,
});

// TODO: HTML 타입을 쓰는게 아니라, AST 를 직접 만들어줘야 할 것 같다. 아니면 Link 를 가진 Paragraph 자체를 제거하고, 이걸로 대체하는 것도 방법이다.
/*
https://www.gatsbyjs.com/tutorial/remark-plugin-tutorial/
https://github.com/syntax-tree/mdast
https://astexplorer.net/
https://github.com/hgezim/gatsby-remark-link-unfurl

참고하기
 */
const convertLinkToCardElement = (linkNode, metadata) => {
  linkNode.type = 'html';
  linkNode.value = `
    <a class='gatsby-remark-link-unfurl__container' href='${metadata.url}' target='_blank' title='${metadata.title}'>
      <div class='gatsby-remark-link-unfurl__media' style='background-image: url(${metadata.image?.url}'></div>
      <div class='gatsby-remark-link-unfurl__content'>
      <header class='gatsby-remark-link-unfurl__title'><p  title='${metadata.title}'>${metadata.title}</p></header>
        <div class='gatsby-remark-link-unfurl__description'><p title='${metadata.description}'>${metadata.description}</p></div>
      <footer>
        <p title='${metadata.site}'>
            ${metadata.site}
        </p>
        <span title='${metadata.site}' style='background-image: url(${metadata.logo}); background-repeat: no-repeat; background-position: center center;'>
        </span>
      </footer>
    </div>
    </a>
  `;
  delete linkNode.children;
  delete linkNode.url;
  delete linkNode.title;
  delete linkNode.data;

  return linkNode;
};
