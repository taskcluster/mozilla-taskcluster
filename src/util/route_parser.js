export default function parseRoute(route) {
  let project, revision, revision_hash, pushId, version, owner, parsedProject;
  let parsedRoute = route.split('.');

  // Assume it's a version 1 routing key if length is 3
  if (parsedRoute.length === 3) {
    version = 'v1';
  } else {
    version = parsedRoute[1];
  }

  switch (version) {
    case 'v1':
      return {
        project: parsedRoute[1],
        revisionHash: parsedRoute[2],
      };
    case 'v2':
      return {
        project: parsedRoute[2],
        revision: parsedRoute[3],
      };
    default:
      throw new Error(
          'Unrecognized treeherder routing key format. Possible formats are:\n' +
          'v1: <treeherder destination>.<project>.<revision>\n' +
          'v2: <treeherder destination>.<version>.<user/project>|<project>.<revision>.<pushLogId/pullRequestId>' +
          `but received: ${route}`
      );
  }
}
