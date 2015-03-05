/**
Helpers for dealing with the config structure of "try".
*/

import mustache from 'mustache';
import Joi from 'joi';

const URL_SCHEMA = Joi.object().keys({
  alias: Joi.string().required(),
  revision: Joi.string().required(),
  path: Joi.string().required(),
  host: Joi.string().required()
});

function getProject(config, name) {
  let project = config.projects[name];
  if (project) return project;

  let allowed = Object.keys(config.projects);
  throw new Error(`
    Unknown project "${project}" allowed options:
      ${allowed.join(', ')}
  `);
}

export function scopes(config, project) {
  let project = getProject(config, project);
  return project.scopes || config.defaultScopes;
}

export function url(config, project, params = {}) {
  let project = getProject(config, project);
  Joi.assert(params, URL_SCHEMA);

  let url = project.url || config.defaultUrl;
  return mustache.render(url, params);
}
