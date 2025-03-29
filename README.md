# rsrch.tech

![image](./public/screenshot.jpeg)

rsrch.tech is an open-source alternative to Perplexity, designed to provide AI-powered research assistance using Mistral AI for language processing and Tavily for web search functionality.

## Introduction

This application combines the power of large language models with web search capabilities to help users conduct research efficiently. Built with Next.js and React, rsrch.tech aims to deliver comprehensive, accurate, and well-sourced information in response to user queries.

## TODO

This project is under active development. Below are some of the planned improvements:

- [ ] Add export to pdf feature
- [x] ~~Performance Optimization~~
- [x] ~~Add citation management~~
- [x] ~~Improve mobile responsiveness~~
- [x] ~~Research mode~~
- [ ] User Authentication
- [ ] Persistent history

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/)

- **AI Processing**:
    - [Mistral AI](https://mistral.ai/) (mistral-small-latest and mistral-large-latest)
    - [AI SDK](https://www.ai-sdk.dev/) for React integration
- **Search Engine**: [Tavily API](https://tavily.com/) for web search functionality

## Getting Started

First, set up your environment variables:

1. Create a `.env.local` file with the following variables:

```
MISTRAL_API_KEY=your_mistral_api_key
TAVILY_API_KEY=your_tavily_api_key
```

2. Install dependencies:

```bash
bun i
```

3. Run the development server:

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## How It Works

1. **Query Processing**: User queries are analyzed to extract research goals
2. **Web Search**: The system performs targeted web searches based on the extracted goals
3. **Response Generation**: Search results are synthesized into comprehensive, properly cited responses
4. **Customization**: Users can select between concise and detailed response modes

## Learn More

To learn more about the technologies used in this project:

- [Next.js Documentation](https://nextjs.org/docs)
- [Mistral AI Documentation](https://docs.mistral.ai/)
- [Tavily API Documentation](https://docs.tavily.com/)
- [AI SDK Documentation](https://www.ai-sdk.dev/docs)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
