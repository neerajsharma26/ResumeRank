import type { Resume } from '@/lib/types';

export const mockResumes: Resume[] = [
  {
    filename: 'jane_doe_frontend_dev.txt',
    content: `
      Jane Doe
      Senior Frontend Developer
      jane.doe@email.com | (123) 456-7890 | linkedin.com/in/janedoe

      Summary:
      Highly skilled Senior Frontend Developer with 8 years of experience in creating responsive and user-friendly web applications. Proficient in React, TypeScript, and modern JavaScript frameworks. Proven ability to lead projects and mentor junior developers.

      Experience:
      - Tech Solutions Inc. | Senior Frontend Developer | 2018 - Present
        - Led the development of a new e-commerce platform using React and Redux, resulting in a 30% increase in user engagement.
        - Optimized application performance, reducing load times by 40%.
        - Mentored a team of 4 junior developers.

      - Web Innovators | Frontend Developer | 2015 - 2018
        - Developed and maintained client websites using HTML, CSS, and JavaScript.
        - Collaborated with designers to implement UI/UX designs.

      Skills:
      - JavaScript, TypeScript, React, Redux, Next.js, HTML5, CSS3, SASS
      - RESTful APIs, GraphQL
      - Webpack, Babel, Git, Jira

      Certifications:
      - Certified React Developer
    `,
  },
  {
    filename: 'john_smith_backend_engineer.txt',
    content: `
      John Smith
      Backend Engineer
      john.smith@email.com | (555) 123-4567 | github.com/johnsmith

      Summary:
      Backend Engineer with 5 years of experience specializing in building scalable and efficient server-side applications. Expertise in Node.js, Python, and database management with PostgreSQL and MongoDB. Passionate about microservices architecture.

      Experience:
      - Data Systems LLC | Backend Engineer | 2019 - Present
        - Designed and implemented a microservices-based architecture for a financial data processing application using Node.js and Docker.
        - Developed REST APIs to support mobile and web clients.
        - Managed PostgreSQL databases, including schema design and query optimization.

      - Code Crafters | Junior Developer | 2017 - 2019
        - Assisted in the development of various web applications using Python and Django.

      Skills:
      - Node.js, Express.js, Python, Django
      - PostgreSQL, MongoDB, Redis
      - Docker, Kubernetes, AWS
      - Microservices, REST APIs

      Education:
      - B.S. in Computer Science, University of Technology
    `,
  },
  {
    filename: 'emily_white_fullstack_dev.txt',
    content: `
      Emily White
      Full-Stack Developer
      emily.white@email.com | (555) 987-6543

      Summary:
      Versatile Full-Stack Developer with 6 years of experience building end-to-end web solutions. Strong skills in both frontend (Vue.js) and backend (Java, Spring Boot) development. Experience with agile methodologies and CI/CD pipelines.

      Experience:
      - Innovate Corp | Full-Stack Developer | 2020 - Present
        - Developed a full-stack internal dashboard using Vue.js and Spring Boot.
        - Implemented CI/CD pipelines using Jenkins, automating deployment processes.
        - Worked in an agile team, participating in daily stand-ups and sprint planning.

      - Digital Creations | Web Developer | 2016 - 2020
        - Built custom WordPress themes and plugins for clients.
        - Maintained and updated legacy systems built with Java and JSP.

      Skills:
      - Frontend: Vue.js, Vuex, JavaScript, HTML, CSS
      - Backend: Java, Spring Boot, Hibernate
      - Databases: MySQL, PostgreSQL
      - Tools: Git, Jenkins, Docker

      Certifications:
      - Oracle Certified Professional, Java SE 8 Programmer
    `,
  },
    {
    filename: 'michael_chen_product_manager.txt',
    content: `
      Michael Chen
      Product Manager
      m.chen@email.com | (555) 555-5555

      Summary:
      Product Manager with 4 years of experience in the tech industry, focusing on SaaS products. Adept at market research, defining product roadmaps, and working with cross-functional teams to deliver user-centric solutions. Lacks deep technical implementation skills but excels at strategy and communication.

      Experience:
      - SaaS Innovations | Product Manager | 2020 - Present
        - Defined product strategy and roadmap for a new analytics platform.
        - Conducted user interviews and market analysis to identify customer needs.
        - Collaborated with engineering and design teams to ship features on time.

      Skills:
      - Product Management, Agile Methodologies, Scrum
      - Market Research, User Experience (UX)
      - JIRA, Confluence, A/B Testing

      Education:
      - MBA, Business School University
      - B.A. in Economics
    `,
  },
];
