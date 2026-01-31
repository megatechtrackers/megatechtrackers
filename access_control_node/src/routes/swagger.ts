import express, { Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from '../config/swagger.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Swagger UI for Access Gateway API
router.use('/api-docs', swaggerUi.serve);
router.get('/api-docs', swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Access Gateway API Documentation'
}));

// OpenAPI JSON spec for Access Gateway
router.get('/api-docs.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Frappe API OpenAPI spec (YAML)
router.get('/frappe-api-docs.yaml', (_req: Request, res: Response) => {
  try {
    // Path to Frappe OpenAPI spec (relative to project root)
    const frappeSpecPath = join(__dirname, '../../../docs/frappe-api-openapi.yaml');
    const frappeSpec = readFileSync(frappeSpecPath, 'utf-8');
    res.setHeader('Content-Type', 'application/x-yaml');
    res.send(frappeSpec);
  } catch (error) {
    res.status(404).json({ error: 'Frappe API spec not found' });
  }
});

// Frappe API OpenAPI spec (JSON)
router.get('/frappe-api-docs.json', (_req: Request, res: Response) => {
  try {
    const frappeSpecPath = join(__dirname, '../../../docs/frappe-api-openapi.yaml');
    const frappeSpec = readFileSync(frappeSpecPath, 'utf-8');
    const spec = yaml.load(frappeSpec);
    res.setHeader('Content-Type', 'application/json');
    res.send(spec);
  } catch (error) {
    res.status(404).json({ error: 'Frappe API spec not found' });
  }
});

// Swagger UI for Frappe API
router.use('/frappe-api-docs', swaggerUi.serve);
router.get('/frappe-api-docs', (_req: Request, res: Response) => {
  try {
    const frappeSpecPath = join(__dirname, '../../../docs/frappe-api-openapi.yaml');
    const frappeSpec = readFileSync(frappeSpecPath, 'utf-8');
    const spec = yaml.load(frappeSpec) as any;
    
    res.send(swaggerUi.generateHTML(spec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Frappe API Documentation'
    }));
  } catch (error) {
    res.status(404).send('<h1>Frappe API spec not found</h1>');
  }
});

export { router as swaggerRouter };
