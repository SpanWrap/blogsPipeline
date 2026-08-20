export class MockImageProvider {
    name = "mock";
    async generateImage(prompt) {
        return {
            url: null,
            base64: null,
            mimeType: "image/png",
            prompt,
            type: "hero",
            altText: `Mock image: ${prompt.slice(0, 80)}`,
        };
    }
    async generateBlogImages(article) {
        return [
            {
                url: null,
                base64: null,
                mimeType: "image/png",
                prompt: `Hero for: ${article.title}`,
                type: "hero",
                altText: `Hero image for ${article.title}`,
            },
        ];
    }
}
