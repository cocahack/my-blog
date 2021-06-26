const { unfurl } = require('unfurl.js');
const { selectAll } = require('unist-util-select');
const Mustache = require('mustache');

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
  video: metadata.open_graph?.videos?.[0] || '',
  image:
      metadata.twitter_card?.images?.[0]
      || metadata.open_graph?.images?.[0]
      || '',
  logo: {
    url: metadata.favicon,
    site:
      metadata.oEmbed?.provider_name
      || metadata.open_graph?.site_name
      || metadata.twitter_card?.site
      || '',
  },
  site:
      metadata.oEmbed?.provider_name
      || metadata.open_graph?.site_name
      || metadata.twitter_card?.site
      || '',
});

const convertLinkToCardElement = (paragraphNode, metadata) => {
  paragraphNode.type = 'html';
  paragraphNode.value = Mustache.render(template, metadata);
  delete paragraphNode.children;

  return paragraphNode;
};

const template = `
  <a class='gatsby-remark-link-unfurl__container' href='{{url}}' target='_blank' title='{{title}}'>
    {{#image}}
      <img class='gatsby-remark-link-unfurl__media' src='{{url}}'  alt="link image"/>
    {{/image}}  
    <div class='gatsby-remark-link-unfurl__content'>
      <header class='gatsby-remark-link-unfurl__title'><p  title='{{title}}'>{{title}}</p></header>
      <div class='gatsby-remark-link-unfurl__description'><p title='{{description}}'>{{description}}</p></div>
      <footer>
        {{#logo}}
          <span title='{{site}}' style='background-image: url({{url}}); background-repeat: no-repeat; background-position: center center;'>
          </span>
        {{/logo}}
        <div title='{{site}}'>
            {{site}}
        </div>
      </footer>
    </div>
  </a>
`;
