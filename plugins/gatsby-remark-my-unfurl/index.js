const { unfurl } = require('unfurl.js');
const { selectAll } = require('unist-util-select');

// eslint-disable-next-line no-unused-vars
module.exports = async ({ markdownAST }, _pluginOptions) => {
  const allParagraphs = selectAll('paragraph:has(:only-child)', markdownAST)
    .filter((node) => node.children[0].type === 'link');

  await Promise.all(
    allParagraphs.map((paragraph) => unfurlFromLink(paragraph))
  );
};

const unfurlFromLink = async (paragraphNode) => {
  const { url } = paragraphNode.children[0];
  const metadata = extractLinkMetadata(await unfurl(url));
  metadata.url = url;

  return convertLinkToCardElement(paragraphNode, metadata);
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

const convertLinkToCardElement = (paragraphNode, metadata) => {
  paragraphNode.type = 'html';
  paragraphNode.value = `
    <a class='gatsby-remark-link-unfurl__container' href='${metadata.url}' target='_blank' title='${metadata.title}'>
      <img class='gatsby-remark-link-unfurl__media' src='${metadata.image?.url}'  alt="link image"/>
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
  delete paragraphNode.children;

  return paragraphNode;
};
