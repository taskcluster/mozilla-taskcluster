/**
Helpers for dealing with the config structure of "try".
*/

import mustache from 'mustache';
import Joi from 'joi';

const URL_SCHEMA = Joi.object().keys({
  alias: Joi.string().required(),
  revision: Joi.string().required(),
  path: Joi.string().allow(''),
  host: Joi.string().required()
});

function getProject(config, name, allowMissing = false) {
  let project = config.projects[name];
  if (project) return project;
  if (allowMissing) return {};

  let allowed = Object.keys(config.projects);
  throw new Error(`
    Unknown project "${name}" allowed options:
      ${allowed.join(', ')}
  `);
}

export function scopes(config, project, allowMissing = false) {
  let project = getProject(config, project, allowMissing);
  return (project.scopes || []).slice();
}

export function level(config, project) {
  let project = getProject(config, project, false);
  return project.level || 1;
}

export function tcYamlUrl(config, params = {}) {
  Joi.assert(params, URL_SCHEMA);
  let url = config.tcYamlUrl;
  return mustache.render(url, params);
}

export function url(config, project, params = {}) {
  let project = getProject(config, project);
  Joi.assert(params, URL_SCHEMA);

  let url = project.url || config.defaultUrl;
  return mustache.render(url, params);
}
