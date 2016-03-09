/**
Utils for formatting pushlogs to treeherder resultset format.
*/

import { createHash } from 'crypto';

function generateHash(parts) {
  return createHash('sha1').update(parts.join('')).digest('hex');
}

/*
logic taken from:
https://github.com/mozilla/treeherder-service/blob/b5ccfc8f49c90e20237df2cbbfe0734b0f52f731/treeherder/etl/pushlog.py#L43
*/
export default function format(repository, push) {
  let revHashComp = [];
  let result = {
    push_timestamp: push.date,
    revisions: [],
    author: push.user,
    active_status: push.active_status || 'active'
  };

  for (let change of push.changesets) {
    let revision = {
      revision: change.node,
      files: change.files,
      author: change.author,
      branch: change.branch,
      comment: change.desc,
      repository: repository
    };
    revHashComp.push(change.node);
    revHashComp.push(change.branch);
    result.revisions.push(revision);
  }

  result.revision_hash = generateHash(revHashComp);
  result.revision = push.changesets[push.changesets.length - 1].node
  console.log(JSON.stringify(result, null, 4));
  return result;
}
