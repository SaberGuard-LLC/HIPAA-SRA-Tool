/* ============================================================================
   SaberGuard SRA Workspace: Security Rule catalog, statuses, rating scales,
   risk scenario library and report completeness checks.
   45 CFR Part 164, Subpart C (164.308, 164.310, 164.312, 164.314, 164.316)
   ========================================================================== */

/* Where the regulation text in CONTROLS comes from. `checked` is the date the
   rows were last compared with the official text in tests/fixtures/. It is
   null until that comparison has been run against a retrieved fixture. */
const CATALOG_SOURCE = {
  label: '45 CFR Part 164, Subpart C',
  url: 'https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C',
  checked: null
};

/* Saved-file format. The name is the import check, so it stays unchanged.
   Version 4 adds the entity profile, typed inventory rows, the flows table,
   id-based risk links, the verification basis and evidence without data. */
const FILE_FORMAT = { name: 'SaberGuard HIPAA SRA', version: 4 };

/* Opening a version 3 file: the three old 164.314 rows move to the rows that
   hold the same subject under the current regulation. Old ids are never
   reused, so a version 3 file can only be read, not written. */
const V3_ID_MAP = { O01: 'O12', O02: 'O13', O03: 'O15' };

/* Rows whose citation or regulation text changed between the version 3
   catalog and this one. A carried answer on one of these rows is marked
   "carried from version 3, review again" and counts as not reviewed until
   the assessor confirms it. Rows the audit marked verbatim, OK or minor keep
   their answer without a flag. */
const V3_REVIEW_IDS = ['A01', 'A02', 'A05', 'A07', 'A10', 'A11', 'A12', 'A15', 'A20', 'A21', 'A22', 'A25', 'A28', 'A29', 'P04', 'O12', 'O13', 'O15'];

/* Entity profile. Answers mark rows Not applicable with the basis recorded. */
const ENTITY_TYPES = [['covered-entity', 'Covered entity'], ['business-associate', 'Business associate'], ['both', 'Both']];
const YES_NO = [['yes', 'Yes'], ['no', 'No']];
function profileApplicability(meta) {
  const out = {};
  const m = meta || {};
  if (m.clearinghouse === 'no') out.A12 = 'Not applicable from the entity profile: the organization is not a health care clearinghouse that is part of a larger organization. 45 CFR 164.308(a)(4)(ii)(A) applies only to such a clearinghouse.';
  if (m.entityType === 'covered-entity') out.O14 = 'Not applicable from the entity profile: the organization is a covered entity and not a business associate. 45 CFR 164.314(a)(2)(iii) applies to the contract or other arrangement between a business associate and a subcontractor.';
  if (m.groupHealthPlan === 'no') {
    out.O15 = 'Not applicable from the entity profile: the organization is not a group health plan. 45 CFR 164.314(b)(1) applies to a group health plan.';
    out.O16 = 'Not applicable from the entity profile: the organization is not a group health plan. 45 CFR 164.314(b)(2) applies to the plan documents of a group health plan.';
  }
  return out;
}
/* Which paragraph of 164.308(b) applies to this entity, for the A29 row. */
function businessAssociateDuty(meta) {
  const t = (meta || {}).entityType;
  if (t === 'covered-entity') return 'Entity profile: covered entity. Paragraph (b)(1) applies: obtain satisfactory assurances from each business associate. Paragraph (b)(2) applies only to a business associate.';
  if (t === 'business-associate') return 'Entity profile: business associate. Paragraph (b)(2) applies: obtain satisfactory assurances from each subcontractor. Paragraph (b)(1) applies only to a covered entity.';
  if (t === 'both') return 'Entity profile: covered entity and business associate. Paragraph (b)(1) applies to the organization\'s business associates and paragraph (b)(2) to its subcontractors.';
  return '';
}

/* Inventory and flow vocabularies. The stored value is the first element.
   "unknown" is a recorded gap, not a no: a row with an unknown kind or zone
   is shown as unclassified and fails a completeness check. The inventory
   holds ePHI only; there is no paper kind or paper transport. "fax" means an
   electronic fax service. */
const INVENTORY = {
  kind: [['person', 'Person'], ['device', 'Device'], ['application', 'Application'], ['datastore', 'Data store'], ['unknown', 'Unknown (not yet classified)']],
  zone: [['people', 'People in the practice'], ['devices', 'Devices in the practice'], ['systems', 'Systems that hold ePHI'], ['external', 'Outside parties'], ['backup', 'Backups and copies'], ['unknown', 'Unknown (not yet classified)']],
  lifecycle: [['create', 'Create'], ['receive', 'Receive'], ['maintain', 'Maintain'], ['transmit', 'Transmit']],
  baa: [['yes', 'Yes, on file'], ['no', 'No'], ['not-required', 'Not required (not a business associate)'], ['unknown', 'Unknown, not confirmed']],
  location: [['on-site', 'On site'], ['home-remote', 'Home or remote'], ['vendor-hosted', 'Vendor hosted'], ['unknown', 'Unknown']],
  yesNo: [['yes', 'Yes'], ['no', 'No'], ['unknown', 'Unknown, not checked'], ['n/a', 'Not applicable']],
  transport: [['https', 'HTTPS'], ['sftp', 'SFTP'], ['email', 'Email'], ['fax', 'Fax service (electronic)'], ['vpn', 'VPN'], ['phone-sms', 'Phone or SMS'], ['removable-media', 'Removable media'], ['direct-entry', 'Direct entry'], ['vendor-internal', 'Inside the vendor'], ['unknown', 'Unknown']]
};
const INVENTORY_LABELS = Object.fromEntries(Object.entries(INVENTORY).map(([k, list]) => [k, Object.fromEntries(list)]));

/* How the assessor verified a catalog row's status. Printed beside the status. */
const BASIS = [['observed', 'Observed'], ['document', 'Document reviewed'], ['stated', 'Stated by the client']];
const BASIS_LABELS = Object.fromEntries(BASIS);

const CATEGORIES = {
  administrative: { label: 'Administrative safeguards', cite: '45 CFR 164.308', short: 'Administrative' },
  physical:       { label: 'Physical safeguards',       cite: '45 CFR 164.310', short: 'Physical' },
  technical:      { label: 'Technical safeguards',      cite: '45 CFR 164.312', short: 'Technical' },
  organization:   { label: 'Organizational requirements', cite: '45 CFR 164.314', short: 'Organizational' },
  documentation:  { label: 'Policies and procedures and documentation requirements', cite: '45 CFR 164.316', short: 'Documentation' }
};

/* Catalog rows. One row per standard, one per titled implementation
   specification, and one for the untitled implementation specifications
   paragraph at 164.314(b)(2). 164.308(b)(2) has no heading and is folded into
   the 164.308(b)(1) row. The regulation states no total; the count is
   SaberGuard's convention.

   Fields:
   id         Stable id. Ids are never reused with a new meaning.
   category   Key into CATEGORIES.
   cite       Paragraph in 45 CFR, without the section symbol.
   type       Standard, Required or Addressable.
   title      The regulation's own heading. When `titleBy` is set the
              regulation gives no heading and the title is SaberGuard's label.
   parent     Id of the standard an implementation specification belongs to.
   regulation The regulation's own wording, quoted without change. Lines are
              marked for the text linter. null means the text has not yet
              been confirmed against the fixture and must not ship.
   summary    SaberGuard's plain-language summary. Not the regulation.
   prompt     What the assessor is asked to check.
   joined     The regulation text is a lead-in paragraph joined with the
              item, or a paragraph joined with its clauses. */
const CONTROLS = [
  /* ---- 164.308 Administrative safeguards -------------------------------- */
  { id: 'A01', category: 'administrative', cite: '164.308(a)(1)(i)', type: 'Standard', title: 'Security management process',
    /* quote */ regulation: 'Implement policies and procedures to prevent, detect, contain, and correct security violations.',
    summary: 'Run a security program that prevents, detects, contains and corrects security violations.',
    prompt: 'Confirm the program operates across the full assessed environment.' },
  { id: 'A02', category: 'administrative', cite: '164.308(a)(1)(ii)(A)', type: 'Required', title: 'Risk analysis', parent: 'A01',
    /* quote */ regulation: 'Conduct an accurate and thorough assessment of the potential risks and vulnerabilities to the confidentiality, integrity, and availability of electronic protected health information held by the covered entity or business associate.',
    summary: 'Assess the risks and vulnerabilities to the confidentiality, integrity and availability of all ePHI the organization holds.',
    prompt: 'Verify scope, data flows, threats, vulnerabilities, existing measures, likelihood, impact, and conclusions.' },
  { id: 'A03', category: 'administrative', cite: '164.308(a)(1)(ii)(B)', type: 'Required', title: 'Risk management', parent: 'A01',
    /* quote */ regulation: 'Implement security measures sufficient to reduce risks and vulnerabilities to a reasonable and appropriate level to comply with § 164.306(a).',
    summary: 'Put security measures in place that bring the identified risks down to a reasonable and appropriate level.',
    prompt: 'Trace analyzed risks to treatment, owners, dates, validation, and acceptance.' },
  { id: 'A04', category: 'administrative', cite: '164.308(a)(1)(ii)(C)', type: 'Required', title: 'Sanction policy', parent: 'A01',
    regulation: null,
    summary: 'Apply appropriate sanctions to workforce members who do not comply with the security policies and procedures.',
    prompt: 'Review the approved policy and de-identified evidence of consistent application.' },
  { id: 'A05', category: 'administrative', cite: '164.308(a)(1)(ii)(D)', type: 'Required', title: 'Information system activity review', parent: 'A01',
    /* quote */ regulation: 'Implement procedures to regularly review records of information system activity, such as audit logs, access reports, and security incident tracking reports.',
    summary: 'Have procedures for regular review of system activity records, for example audit logs, access reports and incident tracking reports.',
    prompt: 'Identify responsible reviewers, coverage, frequency, escalation, and retained evidence.' },
  { id: 'A06', category: 'administrative', cite: '164.308(a)(2)', type: 'Standard', title: 'Assigned security responsibility',
    /* quote */ regulation: 'Identify the security official who is responsible for the development and implementation of the policies and procedures required by this subpart for the covered entity or business associate.',
    summary: 'Name the security official responsible for developing and implementing the Security Rule policies and procedures.',
    prompt: 'Confirm formal assignment, authority, role description, and accountability.' },
  { id: 'A07', category: 'administrative', cite: '164.308(a)(3)(i)', type: 'Standard', title: 'Workforce security',
    regulation: null,
    summary: 'Have policies and procedures so that workforce members get the ePHI access their roles need and nobody else gets access.',
    prompt: 'Test the control across employees, volunteers, contractors, and other workforce members.' },
  { id: 'A08', category: 'administrative', cite: '164.308(a)(3)(ii)(A)', type: 'Addressable', title: 'Authorization and/or supervision', parent: 'A07',
    regulation: null,
    summary: 'Procedures to authorize and/or supervise workforce members who work with ePHI or in places where it can be accessed.',
    prompt: 'Sample approvals and supervision for new, temporary, transferred, and remote workers.' },
  { id: 'A09', category: 'administrative', cite: '164.308(a)(3)(ii)(B)', type: 'Addressable', title: 'Workforce clearance procedure', parent: 'A07',
    regulation: null,
    summary: 'Procedures to determine that a workforce member\'s access to ePHI is appropriate.',
    prompt: 'Review role criteria, screening where appropriate, approvals, and periodic reevaluation.' },
  { id: 'A10', category: 'administrative', cite: '164.308(a)(3)(ii)(C)', type: 'Addressable', title: 'Termination procedures', parent: 'A07',
    /* quote */ regulation: 'Implement procedures for terminating access to electronic protected health information when the employment of, or other arrangement with, a workforce member ends or as required by determinations made as specified in paragraph (a)(3)(ii)(B) of this section.',
    summary: 'Procedures to end ePHI access when a workforce member leaves, and when a clearance determination says access should end.',
    prompt: 'Sample timely account, badge, key, device, token, and remote-access revocation.' },
  { id: 'A11', category: 'administrative', cite: '164.308(a)(4)(i)', type: 'Standard', title: 'Information access management',
    regulation: null,
    summary: 'Policies and procedures for authorizing access to ePHI that are consistent with the Privacy Rule.',
    prompt: 'Confirm least-privilege governance covers all systems, facilities, and support access.' },
  { id: 'A12', category: 'administrative', cite: '164.308(a)(4)(ii)(A)', type: 'Required', title: 'Isolating health care clearinghouse functions', parent: 'A11',
    /* quote */ regulation: 'If a health care clearinghouse is part of a larger organization, the clearinghouse must implement policies and procedures that protect the electronic protected health information of the clearinghouse from unauthorized access by the larger organization.',
    summary: 'Applies only to a health care clearinghouse that is part of a larger organization: protect the clearinghouse\'s ePHI from unauthorized access by the rest of the organization.',
    prompt: 'Document applicability; if applicable, verify technical and organizational separation.' },
  { id: 'A13', category: 'administrative', cite: '164.308(a)(4)(ii)(B)', type: 'Addressable', title: 'Access authorization', parent: 'A11',
    regulation: null,
    summary: 'Policies and procedures for granting access to ePHI, for example through a workstation, transaction, program, process or other mechanism.',
    prompt: 'Sample requests, approvals, role mappings, privileged access, and emergency access.' },
  { id: 'A14', category: 'administrative', cite: '164.308(a)(4)(ii)(C)', type: 'Addressable', title: 'Access establishment and modification', parent: 'A11',
    regulation: null,
    summary: 'Policies and procedures, based on the access authorization policies, to establish, document, review and modify a user\'s right of access.',
    prompt: 'Test joins, transfers, elevated access, recertification, and removals.' },
  { id: 'A15', category: 'administrative', cite: '164.308(a)(5)(i)', type: 'Standard', title: 'Security awareness and training',
    regulation: null,
    summary: 'A security awareness and training program for all workforce members, including management.',
    prompt: 'Confirm onboarding, periodic training, role-based content, completion, and follow-up.' },
  { id: 'A16', category: 'administrative', cite: '164.308(a)(5)(ii)(A)', type: 'Addressable', title: 'Security reminders', parent: 'A15', joined: true,
    regulation: null,
    summary: 'Periodic security updates to the workforce.',
    prompt: 'Review cadence, topics, delivery channels, and retained communications.' },
  { id: 'A17', category: 'administrative', cite: '164.308(a)(5)(ii)(B)', type: 'Addressable', title: 'Protection from malicious software', parent: 'A15', joined: true,
    regulation: null,
    summary: 'Procedures for guarding against, detecting and reporting malicious software.',
    prompt: 'Review endpoint and email defenses, updates, alert handling, user reporting, and coverage.' },
  { id: 'A18', category: 'administrative', cite: '164.308(a)(5)(ii)(C)', type: 'Addressable', title: 'Log-in monitoring', parent: 'A15', joined: true,
    regulation: null,
    summary: 'Procedures for monitoring log-in attempts and reporting discrepancies.',
    prompt: 'Inspect authentication logging, alert thresholds, investigation, and escalation.' },
  { id: 'A19', category: 'administrative', cite: '164.308(a)(5)(ii)(D)', type: 'Addressable', title: 'Password management', parent: 'A15', joined: true,
    regulation: null,
    summary: 'Procedures for creating, changing and safeguarding passwords.',
    prompt: 'Review identity standards, compromised-password response, multi-factor authentication where used, vaulting, and service accounts.' },
  { id: 'A20', category: 'administrative', cite: '164.308(a)(6)(i)', type: 'Standard', title: 'Security incident procedures',
    /* quote */ regulation: 'Implement policies and procedures to address security incidents.',
    summary: 'Policies and procedures for handling security incidents.',
    prompt: 'Verify scope, roles, contacts, triage, legal and privacy coordination, and exercises.' },
  { id: 'A21', category: 'administrative', cite: '164.308(a)(6)(ii)', type: 'Required', title: 'Response and reporting', parent: 'A20',
    /* quote */ regulation: 'Identify and respond to suspected or known security incidents; mitigate, to the extent practicable, harmful effects of security incidents that are known to the covered entity or business associate; and document security incidents and their outcomes.',
    summary: 'Identify and respond to suspected or known incidents, mitigate known harmful effects as far as practicable, and document incidents and outcomes.',
    prompt: 'Sample tickets or exercises from detection through lessons learned.' },
  { id: 'A22', category: 'administrative', cite: '164.308(a)(7)(i)', type: 'Standard', title: 'Contingency plan',
    /* quote */ regulation: 'Establish (and implement as needed) policies and procedures for responding to an emergency or other occurrence (for example, fire, vandalism, system failure, and natural disaster) that damages systems that contain electronic protected health information.',
    summary: 'Policies and procedures for responding to an emergency or other event that damages systems holding ePHI.',
    prompt: 'Confirm the plan addresses cyber, technology, utility, facility, and regional events.' },
  { id: 'A23', category: 'administrative', cite: '164.308(a)(7)(ii)(A)', type: 'Required', title: 'Data backup plan', parent: 'A22',
    regulation: null,
    summary: 'Procedures to create and maintain retrievable exact copies of ePHI.',
    prompt: 'Inspect scope, monitoring, encryption, isolation, retention, failures, and restore results.' },
  { id: 'A24', category: 'administrative', cite: '164.308(a)(7)(ii)(B)', type: 'Required', title: 'Disaster recovery plan', parent: 'A22',
    regulation: null,
    summary: 'Procedures to restore lost data.',
    prompt: 'Verify recovery steps, dependencies, responsibilities, recovery objectives, and testing.' },
  { id: 'A25', category: 'administrative', cite: '164.308(a)(7)(ii)(C)', type: 'Required', title: 'Emergency mode operation plan', parent: 'A22',
    /* quote */ regulation: 'Establish (and implement as needed) procedures to enable continuation of critical business processes for protection of the security of electronic protected health information while operating in emergency mode.',
    summary: 'Procedures that keep the critical processes which protect the security of ePHI running while operating in emergency mode.',
    prompt: 'Review downtime workflows, minimum security controls, alternate sites, and communications.' },
  { id: 'A26', category: 'administrative', cite: '164.308(a)(7)(ii)(D)', type: 'Addressable', title: 'Testing and revision procedures', parent: 'A22',
    regulation: null,
    summary: 'Procedures for periodic testing and revision of contingency plans.',
    prompt: 'Review exercise dates, scenarios, participants, results, corrective actions, and retesting.' },
  { id: 'A27', category: 'administrative', cite: '164.308(a)(7)(ii)(E)', type: 'Addressable', title: 'Applications and data criticality analysis', parent: 'A22',
    regulation: null,
    summary: 'Assess how critical each application and data set is to the other parts of the contingency plan.',
    prompt: 'Reconcile business impact results to recovery tiers, recovery objectives, and dependencies.' },
  { id: 'A28', category: 'administrative', cite: '164.308(a)(8)', type: 'Standard', title: 'Evaluation',
    /* quote */ regulation: 'Perform a periodic technical and nontechnical evaluation, based initially upon the standards implemented under this rule and, subsequently, in response to environmental or operational changes affecting the security of electronic protected health information, that establishes the extent to which a covered entity\'s or business associate\'s security policies and procedures meet the requirements of this subpart.',
    summary: 'Evaluate periodically, first against the standards as implemented and then whenever environmental or operational changes affect ePHI security, how far the security policies and procedures meet the Security Rule.',
    prompt: 'Review evaluation cadence, change triggers, scope, independence, findings, and follow-up.' },
  { id: 'A29', category: 'administrative', cite: '164.308(b)(1) and (b)(2)', type: 'Standard', title: 'Business associate contracts and other arrangements', joined: true,
    /* quote */ regulation: 'A covered entity may permit a business associate to create, receive, maintain, or transmit electronic protected health information on the covered entity\'s behalf only if the covered entity obtains satisfactory assurances, in accordance with § 164.314(a), that the business associate will appropriately safeguard the information. A covered entity is not required to obtain such satisfactory assurances from a business associate that is a subcontractor. A business associate may permit a business associate that is a subcontractor to create, receive, maintain, or transmit electronic protected health information on its behalf only if the business associate obtains satisfactory assurances, in accordance with § 164.314(a), that the subcontractor will appropriately safeguard the information.',
    summary: 'Paragraph (b)(1) is the covered entity\'s duty: let a business associate handle ePHI only with satisfactory assurances under 164.314(a). Paragraph (b)(2) is the business associate\'s duty toward its subcontractors. Appendix A to Subpart C lists (b)(1) as the standard; (b)(2) carries no heading and is shown here with it.',
    prompt: 'Reconcile ePHI vendors to executed agreements, due diligence, monitoring, and termination.' },
  { id: 'A30', category: 'administrative', cite: '164.308(b)(3)', type: 'Required', title: 'Written contract or other arrangement', parent: 'A29',
    /* quote */ regulation: 'Document the satisfactory assurances required by paragraph (b)(1) or (b)(2) of this section through a written contract or other arrangement with the business associate that meets the applicable requirements of § 164.314(a).',
    summary: 'Record the assurances in a written contract or other arrangement that meets 164.314(a).',
    prompt: 'Sample executed agreements against the 164.314(a) terms and confirm every business associate has one.' },

  /* ---- 164.310 Physical safeguards ------------------------------------- */
  { id: 'P01', category: 'physical', cite: '164.310(a)(1)', type: 'Standard', title: 'Facility access controls',
    regulation: null,
    summary: 'Policies and procedures that limit physical access to electronic information systems and the facilities that house them, while allowing properly authorized access.',
    prompt: 'Review all offices, server rooms, records areas, colocations, and remote work locations.' },
  { id: 'P02', category: 'physical', cite: '164.310(a)(2)(i)', type: 'Addressable', title: 'Contingency operations', parent: 'P01',
    regulation: null,
    summary: 'Procedures that allow facility access to support restoring lost data under the disaster recovery plan and emergency mode operations plan.',
    prompt: 'Validate emergency authorization, alternate access, and restoration-site procedures.' },
  { id: 'P03', category: 'physical', cite: '164.310(a)(2)(ii)', type: 'Addressable', title: 'Facility security plan', parent: 'P01',
    regulation: null,
    summary: 'Policies and procedures to safeguard the facility and its equipment from unauthorized physical access, tampering and theft.',
    prompt: 'Inspect boundaries, locks, badges, alarms, cameras, server rooms, and response.' },
  { id: 'P04', category: 'physical', cite: '164.310(a)(2)(iii)', type: 'Addressable', title: 'Access control and validation procedures', parent: 'P01',
    /* quote */ regulation: 'Implement procedures to control and validate a person\'s access to facilities based on their role or function, including visitor control, and control of access to software programs for testing and revision.',
    summary: 'Procedures to control and validate who can enter facilities based on role or function, including visitor control, and to control access to software programs for testing and revision.',
    prompt: 'Sample access lists, visitor logs, approvals, reviews, and revoked access.' },
  { id: 'P05', category: 'physical', cite: '164.310(a)(2)(iv)', type: 'Addressable', title: 'Maintenance records', parent: 'P01',
    regulation: null,
    summary: 'Policies and procedures to document repairs and modifications to the physical components of a facility that relate to security, such as hardware, walls, doors and locks.',
    prompt: 'Review records for locks, doors, walls, cameras, alarms, and related hardware.' },
  { id: 'P06', category: 'physical', cite: '164.310(b)', type: 'Standard', title: 'Workstation use',
    regulation: null,
    summary: 'Policies and procedures that specify the proper functions, the manner of use, and the physical surroundings of workstations that can access ePHI.',
    prompt: 'Observe clinical, administrative, shared, kiosk, and remote-work settings.' },
  { id: 'P07', category: 'physical', cite: '164.310(c)', type: 'Standard', title: 'Workstation security',
    regulation: null,
    summary: 'Physical safeguards for all workstations that access ePHI, so that access is restricted to authorized users.',
    prompt: 'Check placement, privacy, locking, secure rooms, unattended use, and portable devices.' },
  { id: 'P08', category: 'physical', cite: '164.310(d)(1)', type: 'Standard', title: 'Device and media controls',
    regulation: null,
    summary: 'Policies and procedures that govern the receipt and removal of hardware and electronic media containing ePHI into and out of a facility, and their movement within it.',
    prompt: 'Verify the lifecycle from acquisition and inventory through transfer and destruction.' },
  { id: 'P09', category: 'physical', cite: '164.310(d)(2)(i)', type: 'Required', title: 'Disposal', parent: 'P08',
    regulation: null,
    summary: 'Policies and procedures for the final disposition of ePHI and/or the hardware or electronic media on which it is stored.',
    prompt: 'Sample destruction certificates, vendor custody, approved methods, and verification.' },
  { id: 'P10', category: 'physical', cite: '164.310(d)(2)(ii)', type: 'Required', title: 'Media re-use', parent: 'P08',
    regulation: null,
    summary: 'Procedures for removing ePHI from electronic media before the media are made available for re-use.',
    prompt: 'Validate sanitization standards, records, verification, and handling of failed media.' },
  { id: 'P11', category: 'physical', cite: '164.310(d)(2)(iii)', type: 'Addressable', title: 'Accountability', parent: 'P08',
    regulation: null,
    summary: 'Keep a record of the movements of hardware and electronic media and of any person responsible for them.',
    prompt: 'Review inventory accuracy, assignment, transfer, return, and loss investigation.' },
  { id: 'P12', category: 'physical', cite: '164.310(d)(2)(iv)', type: 'Addressable', title: 'Data backup and storage', parent: 'P08',
    regulation: null,
    summary: 'Create a retrievable exact copy of ePHI, when needed, before equipment is moved.',
    prompt: 'Sample moves and verify backup decisions, completion, protection, and restoration.' },

  /* ---- 164.312 Technical safeguards ------------------------------------ */
  { id: 'T01', category: 'technical', cite: '164.312(a)(1)', type: 'Standard', title: 'Access control',
    regulation: null,
    summary: 'Technical policies and procedures for systems that maintain ePHI, so that only persons or software programs granted access rights can get in.',
    prompt: 'Validate enforcement across applications, infrastructure, databases, endpoints, integrations, and support tools.' },
  { id: 'T02', category: 'technical', cite: '164.312(a)(2)(i)', type: 'Required', title: 'Unique user identification', parent: 'T01',
    /* quote */ regulation: 'Assign a unique name and/or number for identifying and tracking user identity.',
    summary: 'Give each user a unique name and/or number so activity can be traced to a person.',
    prompt: 'Find shared accounts and verify identity lifecycle, traceability, and service-account governance.' },
  { id: 'T03', category: 'technical', cite: '164.312(a)(2)(ii)', type: 'Required', title: 'Emergency access procedure', parent: 'T01',
    regulation: null,
    summary: 'Procedures for obtaining necessary ePHI during an emergency.',
    prompt: 'Test break-glass access, authorization, monitoring, review, and credential availability.' },
  { id: 'T04', category: 'technical', cite: '164.312(a)(2)(iii)', type: 'Addressable', title: 'Automatic logoff', parent: 'T01',
    regulation: null,
    summary: 'Electronic procedures that end a session after a set period of inactivity.',
    prompt: 'Validate timeout decisions and configuration by system, device, risk, and workflow.' },
  { id: 'T05', category: 'technical', cite: '164.312(a)(2)(iv)', type: 'Addressable', title: 'Encryption and decryption', parent: 'T01',
    regulation: null,
    summary: 'A mechanism to encrypt and decrypt ePHI.',
    prompt: 'Assess ePHI at rest on endpoints, servers, databases, backups, removable media, and cloud services.' },
  { id: 'T06', category: 'technical', cite: '164.312(b)', type: 'Standard', title: 'Audit controls',
    regulation: null,
    summary: 'Hardware, software and/or procedural mechanisms that record and examine activity in systems that contain or use ePHI.',
    prompt: 'Validate event coverage, identity, timestamps, integrity, retention, alerting, and review.' },
  { id: 'T07', category: 'technical', cite: '164.312(c)(1)', type: 'Standard', title: 'Integrity',
    regulation: null,
    summary: 'Policies and procedures to protect ePHI from improper alteration or destruction.',
    prompt: 'Review authorization, change control, malware protection, backups, and integrity monitoring.' },
  { id: 'T08', category: 'technical', cite: '164.312(c)(2)', type: 'Addressable', title: 'Mechanism to authenticate electronic protected health information', parent: 'T07',
    regulation: null,
    summary: 'Electronic mechanisms to corroborate that ePHI has not been altered or destroyed in an unauthorized manner.',
    prompt: 'Evaluate checksums, signatures, validation rules, reconciliation, and tamper evidence where reasonable.' },
  { id: 'T09', category: 'technical', cite: '164.312(d)', type: 'Standard', title: 'Person or entity authentication',
    regulation: null,
    summary: 'Procedures to verify that a person or entity seeking access to ePHI is the one claimed.',
    prompt: 'Review authentication assurance, multi-factor authentication where used, federation, service identities, and identity proofing.' },
  { id: 'T10', category: 'technical', cite: '164.312(e)(1)', type: 'Standard', title: 'Transmission security',
    regulation: null,
    summary: 'Technical security measures that guard against unauthorized access to ePHI transmitted over an electronic communications network.',
    prompt: 'Map transmission paths including email, portals, APIs, VPN, wireless, fax services, and vendors.' },
  { id: 'T11', category: 'technical', cite: '164.312(e)(2)(i)', type: 'Addressable', title: 'Integrity controls', parent: 'T10',
    regulation: null,
    summary: 'Security measures so that electronically transmitted ePHI is not improperly modified without detection until it is disposed of.',
    prompt: 'Assess secure protocols, message integrity, certificates, file validation, and transfer monitoring.' },
  { id: 'T12', category: 'technical', cite: '164.312(e)(2)(ii)', type: 'Addressable', title: 'Encryption', parent: 'T10',
    regulation: null,
    summary: 'A mechanism to encrypt ePHI whenever deemed appropriate.',
    prompt: 'Validate current cryptography and configuration for every internal and external transmission path.' },

  /* ---- 164.314 Organizational requirements ----------------------------- */
  { id: 'O11', category: 'organization', cite: '164.314(a)(1)', type: 'Standard', title: 'Business associate contracts or other arrangements',
    /* quote */ regulation: 'The contract or other arrangement required by § 164.308(b)(3) must meet the requirements of paragraph (a)(2)(i), (a)(2)(ii), or (a)(2)(iii) of this section, as applicable.',
    summary: 'The written contract or other arrangement required by 164.308(b)(3) must meet whichever of the three implementation specifications below applies.',
    prompt: 'Identify which of (a)(2)(i), (ii) or (iii) applies to each business associate relationship.' },
  { id: 'O12', category: 'organization', cite: '164.314(a)(2)(i)', type: 'Required', title: 'Business associate contracts', parent: 'O11', joined: true,
    /* quote */ regulation: 'The contract must provide that the business associate will— (A) Comply with the applicable requirements of this subpart; (B) In accordance with § 164.308(b)(2), ensure that any subcontractors that create, receive, maintain, or transmit electronic protected health information on behalf of the business associate agree to comply with the applicable requirements of this subpart by entering into a contract or other arrangement that complies with this section; and (C) Report to the covered entity any security incident of which it becomes aware, including breaches of unsecured protected health information as required by § 164.410.',
    summary: 'The contract must say the business associate will comply with the Security Rule, will bind its subcontractors that handle ePHI to the same, and will report security incidents to the covered entity, including breaches of unsecured protected health information.',
    prompt: 'Review agreement language against the three clauses and confirm the operational relationship matches it.' },
  { id: 'O13', category: 'organization', cite: '164.314(a)(2)(ii)', type: 'Required', title: 'Other arrangements', parent: 'O11',
    /* quote */ regulation: 'The covered entity is in compliance with paragraph (a)(1) of this section if it has another arrangement in place that meets the requirements of § 164.504(e)(3).',
    summary: 'Instead of a contract, an arrangement that meets 164.504(e)(3) satisfies the standard.',
    prompt: 'Document applicability and review the memorandum, law, or other arrangement relied on.' },
  { id: 'O14', category: 'organization', cite: '164.314(a)(2)(iii)', type: 'Required', title: 'Business associate contracts with subcontractors', parent: 'O11',
    /* quote */ regulation: 'The requirements of paragraphs (a)(2)(i) and (a)(2)(ii) of this section apply to the contract or other arrangement between a business associate and a subcontractor required by § 164.308(b)(4) in the same manner as such requirements apply to contracts or other arrangements between a covered entity and business associate.',
    summary: 'A business associate\'s contract or arrangement with a subcontractor must meet the same terms as a covered entity\'s contract with a business associate. The regulation\'s cross-reference to 164.308(b)(4) is quoted as published; 164.308(b) has no paragraph (4). The subcontractor duty is at 164.308(b)(2) and the written arrangement at 164.308(b)(3).',
    prompt: 'For a business associate: sample subcontractor agreements against the (a)(2)(i) clauses.' },
  { id: 'O15', category: 'organization', cite: '164.314(b)(1)', type: 'Standard', title: 'Requirements for group health plans',
    /* quote */ regulation: 'Except when the only electronic protected health information disclosed to a plan sponsor is disclosed pursuant to § 164.504(f)(1)(ii) or (iii), or as authorized under § 164.508, a group health plan must ensure that its plan documents provide that the plan sponsor will reasonably and appropriately safeguard electronic protected health information created, received, maintained, or transmitted to or by the plan sponsor on behalf of the group health plan.',
    summary: 'Applies to a group health plan that discloses ePHI to its plan sponsor beyond the exceptions named: the plan documents must require the sponsor to safeguard that ePHI.',
    prompt: 'Document applicability and inspect the plan documents for the sponsor safeguard provisions.' },
  { id: 'O16', category: 'organization', cite: '164.314(b)(2)', type: 'Required', title: 'Plan document provisions', titleBy: 'SaberGuard', parent: 'O15', joined: true,
    /* quote */ regulation: 'The plan documents of the group health plan must be amended to incorporate provisions to require the plan sponsor to— (i) Implement administrative, physical, and technical safeguards that reasonably and appropriately protect the confidentiality, integrity, and availability of the electronic protected health information that it creates, receives, maintains, or transmits on behalf of the group health plan; (ii) Ensure that the adequate separation required by § 164.504(f)(2)(iii) is supported by reasonable and appropriate security measures; (iii) Ensure that any agent to whom it provides this information agrees to implement reasonable and appropriate security measures to protect the information; and (iv) Report to the group health plan any security incident of which it becomes aware.',
    summary: 'The plan documents must require the sponsor to implement safeguards for the ePHI, support the required separation with security measures, bind its agents to security measures, and report security incidents to the plan. The regulation heads this paragraph only "Implementation specifications", so the title is SaberGuard\'s label.',
    prompt: 'Inspect plan amendments for each of the four provisions.' },

  /* ---- 164.316 Policies and procedures and documentation requirements -- */
  { id: 'D01', category: 'documentation', cite: '164.316(a)', type: 'Standard', title: 'Policies and procedures',
    regulation: null,
    summary: 'Reasonable and appropriate policies and procedures to comply with the Security Rule, taking into account the factors in 164.306(b)(2). Policies and procedures may be changed at any time if the changes are documented and implemented.',
    prompt: 'Verify that documented requirements match actual operations and current risks.' },
  { id: 'D02', category: 'documentation', cite: '164.316(b)(1)', type: 'Standard', title: 'Documentation', joined: true,
    /* quote */ regulation: '(i) Maintain the policies and procedures implemented to comply with this subpart in written (which may be electronic) form; and (ii) If an action, activity or assessment is required by this subpart to be documented, maintain a written (which may be electronic) record of the action, activity, or assessment.',
    summary: 'Keep the policies and procedures in written or electronic form, and keep a written or electronic record of every action, activity or assessment the Security Rule requires to be documented.',
    prompt: 'Confirm the assessment evidence supports conclusions and required actions are recorded.' },
  { id: 'D03', category: 'documentation', cite: '164.316(b)(2)(i)', type: 'Required', title: 'Time limit', parent: 'D02',
    /* quote */ regulation: 'Retain the documentation required by paragraph (b)(1) of this section for 6 years from the date of its creation or the date when it last was in effect, whichever is later.',
    summary: 'Keep the required documentation for 6 years from its creation or from the date it was last in effect, whichever is later.',
    prompt: 'Review retention schedules, repositories, disposition controls, and sample availability.' },
  { id: 'D04', category: 'documentation', cite: '164.316(b)(2)(ii)', type: 'Required', title: 'Availability', parent: 'D02',
    regulation: null,
    summary: 'Make the documentation available to the people responsible for implementing the procedures it covers.',
    prompt: 'Validate access, workforce awareness, outage access, and appropriate restrictions.' },
  { id: 'D05', category: 'documentation', cite: '164.316(b)(2)(iii)', type: 'Required', title: 'Updates', parent: 'D02',
    /* quote */ regulation: 'Review documentation periodically, and update as needed, in response to environmental or operational changes affecting the security of the electronic protected health information.',
    summary: 'Review the documentation periodically and update it as needed when environmental or operational changes affect the security of ePHI.',
    prompt: 'Inspect review dates, change triggers, revision history, approvals, and communication.' }
];

const CONTROL_BY_ID = Object.fromEntries(CONTROLS.map(c => [c.id, c]));

/* Counts derived from the catalog. Nothing displays a hardcoded total. */
const CATALOG_COUNTS = (() => {
  const byType = { Standard: 0, Required: 0, Addressable: 0 };
  const byCategory = {};
  CONTROLS.forEach(c => { byType[c.type]++; byCategory[c.category] = (byCategory[c.category] || 0) + 1; });
  return { total: CONTROLS.length, byType, byCategory };
})();

/* Status vocabulary. `key` is the stored value; `label` is what prints.
   The two statuses marked addressableOnly follow 45 CFR 164.306(d)(3): assess
   whether an addressable specification is reasonable and appropriate;
   implement it if it is; if it is not, document why and implement an
   equivalent alternative measure if one is reasonable and appropriate.
   `needsNote` statuses fail a completeness check when the note is empty. */
const STATUSES = {
  'met':     { key: 'met',     label: 'Met',            short: 'Met',      tone: 'good', scoreAs: 'met',
               definition: 'The standard or implementation specification is in place, operating as intended, and supported by what the assessor reviewed.' },
  'partial': { key: 'partial', label: 'Partially met',  short: 'Partial',  tone: 'warn', scoreAs: 'partial', needsNote: true,
               definition: 'In place in part, inconsistently, or without adequate support. Corrective action is recommended.' },
  'not-met': { key: 'not-met', label: 'Not met',        short: 'Not met',  tone: 'crit', scoreAs: 'gap', needsNote: true,
               definition: 'Absent or ineffective, and no documented alternative measure or documented decision is in place.' },
  'alt':     { key: 'alt',     label: 'Alternative measure in place', short: 'Alternative', tone: 'good', scoreAs: 'met', needsNote: true, addressableOnly: true,
               definition: 'Addressable specification not implemented as written. The assessor reviewed the organization\'s documented reason and the equivalent alternative measure that is in place (45 CFR 164.306(d)(3)).' },
  'doc':     { key: 'doc',     label: 'Not implemented, decision documented', short: 'Documented', tone: 'na', scoreAs: 'excluded', needsNote: true, addressableOnly: true,
               definition: 'Addressable specification not implemented and no alternative measure in place. The assessor reviewed the documented reason why neither is reasonable and appropriate. The parent standard still has to be met (45 CFR 164.306(d)(3)).' },
  'na':      { key: 'na',      label: 'Not applicable', short: 'N/A',      tone: 'na',   scoreAs: 'excluded', needsNote: true,
               definition: 'The standard or specification does not apply to the organization. The basis is recorded in the assessment notes.' }
};
function statusesFor(control) {
  return Object.values(STATUSES).filter(st => !st.addressableOnly || control.type === 'Addressable');
}

/* Rating scales. These scales and the risk level thresholds are SaberGuard's
   own. HHS does not prescribe a scoring method. */
const LIKELIHOOD = [
  [1, 'Rare',        'Would only occur in exceptional circumstances; strong compensating measures are in place.'],
  [2, 'Unlikely',    'Could occur at some time but is not expected; measures reduce exposure substantially.'],
  [3, 'Possible',    'Might occur at some time; partial measures or known weaknesses exist.'],
  [4, 'Likely',      'Will probably occur in most circumstances; weak or missing measures, or prior incidents.'],
  [5, 'Almost certain', 'Expected to occur; active threat activity with no effective measure.']
];

const IMPACT = [
  [1, 'Negligible',  'Minimal effect; no ePHI disclosure, brief disruption, no regulatory exposure.'],
  [2, 'Minor',       'Limited ePHI exposure or short outage; handled with routine procedures.'],
  [3, 'Moderate',    'Confirmed ePHI exposure or disruption requiring formal response; possible breach notification.'],
  [4, 'Major',       'Significant ePHI breach or prolonged outage affecting patient care, with regulatory and financial consequences.'],
  [5, 'Severe',      'Large-scale breach, patient safety impact, enforcement action, or threat to organizational viability.']
];

const RISK_LEVELS = [
  { key: 'low',    label: 'Low',    min: 1,  max: 7,  tone: 'good', guidance: 'Monitor and address through routine operations. Accept with a documented rationale where appropriate.' },
  { key: 'medium', label: 'Medium', min: 8,  max: 14, tone: 'warn', guidance: 'Plan remediation within the organization\'s review cycle. Assign an owner and target date.' },
  { key: 'high',   label: 'High',   min: 15, max: 25, tone: 'crit', guidance: 'Schedule remediation or compensating measures first. Any decision to accept the risk is documented and approved by management.' }
];

function riskLevel(score) {
  const n = Number(score) || 0;
  return RISK_LEVELS.find(l => n >= l.min && n <= l.max) || RISK_LEVELS[0];
}

const DECISIONS = ['Mitigate', 'Accept', 'Transfer', 'Avoid'];
const RISK_STATUSES = ['Open', 'In progress', 'Closed'];
const CLASSIFICATIONS = ['Confidential', 'Restricted', 'Internal use only'];
const REPORT_STATUSES = ['Draft', 'Final'];

/* Risk scenario library. Scenarios that can pre-fill a risk register entry.
   They are risks an assessor may record, not requirements of the Security
   Rule. The current rule does not name multi-factor authentication or
   patching, and encryption is an addressable specification. */
const RISK_SCENARIOS = [
  { text: 'Ransomware or destructive malware encrypts or destroys systems that store ePHI.', controls: 'A17, A21, A23, A24, A25' },
  { text: 'Phishing or credential theft compromises workforce email or EHR accounts.', controls: 'A15, A19, T09' },
  { text: 'A laptop, phone, or removable media containing unencrypted ePHI is lost or stolen.', controls: 'P08, P11, T05' },
  { text: 'A workforce member accesses patient records without a business need (snooping or insider misuse).', controls: 'A04, A05, A11, T06' },
  { text: 'A business associate or cloud vendor suffers a breach that exposes the organization\'s ePHI.', controls: 'A29, A30, O12' },
  { text: 'Devices or electronic media containing ePHI are disposed of or reused without sanitization or destruction.', controls: 'P09, P10' },
  { text: 'ePHI is transmitted without encryption (email, file transfer, fax-to-email, messaging).', controls: 'T10, T12' },
  { text: 'Unpatched or end-of-life systems expose known vulnerabilities to exploitation.', controls: 'A03, A17, A28' },
  { text: 'Backups fail, are incomplete, or cannot be restored when needed.', controls: 'A23, A24, A26' },
  { text: 'A natural disaster, fire, flood, or extended power or network outage disrupts access to ePHI.', controls: 'A22, A25, P02' },
  { text: 'Misconfigured cloud storage or file sharing exposes ePHI to unauthorized parties.', controls: 'T01, A13, A14' },
  { text: 'Access for a departed workforce member is not removed promptly.', controls: 'A10, A14' },
  { text: 'Shared or generic accounts prevent accountability for ePHI access.', controls: 'T02, T06' },
  { text: 'Audit logs are not collected or reviewed, so unauthorized activity goes undetected.', controls: 'A05, A18, T06' },
  { text: 'An unauthorized person enters a restricted area (tailgating, unlocked doors, unattended workstations).', controls: 'P01, P03, P04, P07' },
  { text: 'Business associate agreements are missing, expired, or do not cover all vendors handling ePHI.', controls: 'A29, A30, O12' },
  { text: 'Remote access or email is protected by a password alone, without multi-factor authentication.', controls: 'A19, T09' },
  { text: 'Workforce members have not completed security awareness training or role-based refreshers.', controls: 'A15, A16' }
];

/* Report completeness checks. They test whether fields are filled in. They do
   not test whether the risk analysis is accurate or thorough. Each returns
   true when the field is complete for that item. */
const READINESS_CHECKS = [
  { key: 'profile',     label: 'Organization, assessment date, lead assessor, scope statement, and entity profile recorded' },
  { key: 'inventory',   label: 'At least one ePHI system or location inventoried, and every row has a name, the ePHI held, a kind, a zone, and at least one lifecycle stage' },
  { key: 'flows',       label: 'Every data flow names two different inventory rows' },
  { key: 'linked',      label: 'Every inventory row or data flow flagged for a missing or unconfirmed business associate agreement, encryption, or multi-factor authentication is linked to a risk' },
  { key: 'reviewed',    label: 'Every catalog row reviewed, including answers carried from version 3' },
  { key: 'basis',       label: 'Verification basis recorded for every reviewed row' },
  { key: 'gapnotes',    label: 'Assessment notes recorded for every row rated Partially met, Not met, Not applicable, Alternative measure in place, or Not implemented, decision documented' },
  { key: 'recs',        label: 'Recommendation recorded for every row rated Partially met or Not met' },
  { key: 'risksExist',  label: 'At least one risk recorded in the risk register' },
  { key: 'risks',       label: 'Every recorded risk has a description, likelihood, impact, owner, target date, and treatment plan' },
  { key: 'approval',    label: 'Management approver named' }
];
