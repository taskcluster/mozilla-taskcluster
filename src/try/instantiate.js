import * as Joi from 'joi';
import slugid from 'slugid';
import yaml from 'js-yaml';
import mustache from 'mustache';

// Regular expression matching: X days Y hours Z minutes
let timeExp = /^(\s*(\d+)\s*d(ays?)?)?(\s*(\d+)\s*h(ours?)?)?(\s*(\d+)\s*m(in(utes?)?)?)?\s*$/;

/** Parse time string */
export function parseTime(str) {
  // Parse the string
  let match = timeExp.exec(str);
  if (!match) {
    throw new Error("String: '" + str + "' isn't a time expression");
  }
  // Return parsed values
  return {
    days:     parseInt(match[2] || 0),
    hours:    parseInt(match[5] || 0),
    minutes:  parseInt(match[8] || 0)
  };
};

/** Convert time object to relative Date object*/
export function relativeTime(time, to = new Date()) {
  return new Date(
    to.getTime()
    + time.days * 24 * 60 * 60 * 1000
    + time.hours     * 60 * 60 * 1000
    + time.minutes        * 60 * 1000
  );
};

/**
 * Instantiate a task-graph template from YAML string
 *
 * options:
 * {
 *   owner:         'user@exmaple.com',  // Owner emails
 *   source:        'http://...'         // Source file this was instantiated from
 *   revision:      '...',               // Revision hash string
 *   comment:       'try: ...',          // Latest commit comment
 *   project:       'try',               // Treeherder project name
 *   revision_hash: '...',               // Revision hash for treeherder resultset
 *   pushlog_id:    '...',               // Pushlog id based on json-pushes
 *   url:           '...',               // Repository url
 * }
 *
 * In in addition to options provided above the following paramters is available
 * to templates:
 *  - `now` date-time string for now,
 *  - `from-now` modifier taking a relative date as 'X days Y hours Z minutes'
 *  - `as-slugid` modifier converting a label to a slugid
 *
 */
export default function instantiate(template, options) {
  // Validate options
  Joi.assert(options, Joi.object({
    owner: Joi.string().required(),
    source: Joi.string().required(),
    revision: Joi.string().required(),
    project: Joi.string().required(),
    revision_hash: Joi.string().required(),
    comment: Joi.string().default(""),
    pushlog_id: Joi.string().required(),
    url: Joi.string().required()
  }));

  // Create label cache, so we provide the same slugids for the same label
  let labelsToSlugids = {};

  function fromNow() {
    return function(text, render) {
      return render(relativeTime(parseTime(text)).toJSON());
    }
  }

  function asSlugId() {
    return function(label, render) {
      let result = labelsToSlugids[label];
      if (result === undefined) {
        result = labelsToSlugids[label] = slugid.v4();
      }
      return render(result);
    }
  }

  // Parameterize template
  template = mustache.render(template, {
    now: new Date().toJSON(),
    owner: options.owner,
    source: options.source,
    revision: options.revision,
    comment: options.comment,
    project: options.project,
    revision_hash: options.revision_hash,
    pushlog_id: options.pushlog_id,
    url: options.url,
    from_now: fromNow,
    as_slugid: asSlugId
  });

  // Parse template
  return yaml.safeLoad(template);
};
