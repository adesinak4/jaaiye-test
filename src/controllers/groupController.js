const Group = require('../models/Group');
const Event = require('../models/Event');
const EventParticipant = require('../models/EventParticipant');
const User = require('../models/User');
const { sendNotification } = require('../services/notificationService');
const firebaseService = require('../services/firebaseService');
const logger = require('../utils/logger');
const { successResponse, errorResponse } = require('../utils/response');
const { NotFoundError, ForbiddenError, BadRequestError, ValidationError } = require('../utils/errors');
const { asyncHandler } = require('../utils/asyncHandler');

// @desc    Create a new group
// @route   POST /api/groups
// @access  Private
exports.createGroup = asyncHandler(async (req, res) => {
  try {
    const { name, description, memberIds = [] } = req.body;
    const creatorId = req.user.id;

    if (!name || name.trim().length === 0) throw new ValidationError('Group name is required');

    const group = await Group.create({
      name: name.trim(),
      description: description?.trim(),
      creator: creatorId
    });

    if (memberIds.length > 0) {
      await Promise.all(memberIds.map(memberId =>
        group.addMember(memberId, creatorId, 'member')
      ));
    }

    const populatedGroup = await Group.findById(group._id)
      .populate('creator', 'username fullName profilePicture')
      .populate('members.user', 'username fullName profilePicture')
      .populate('members.addedBy', 'username fullName');

    // 🔸 Soft-sync to Firebase
    try {
      // Convert members to plain object with primitive values only
      const plainMembers = {};
      for (const member of populatedGroup.members) {
        if (member.user && member.user._id) {
          const userId = member.user._id.toString();
          plainMembers[userId] = {
            name: String(member.user.fullName || member.user.username || 'Unknown User'),
            avatar: String(member.user.profilePicture || ''),
            role: String(member.role || 'member')
          };
        }
      }

      await firebaseService.createGroup(group._id.toString(), {
        name: String(group.name),
        description: String(group.description || ''),
        creator: String(creatorId),
        members: plainMembers
      });
    } catch (firebaseError) {
      logger.error('Failed to sync group to Firebase', {
        groupId: group._id,
        error: firebaseError.message,
        creatorId
      });
    }

    if (memberIds.length > 0) {
      try {
        const notificationPromises = memberIds.map(memberId =>
          sendNotification(memberId, {
            title: 'Added to Group',
            body: `You've been added to the group "${group.name}"`
          }, {
            type: 'group_member_added',
            groupId: group._id.toString()
          })
        );
        await Promise.all(notificationPromises);
      } catch (notificationError) {
        logger.error('Failed to send notifications for group creation', {
          groupId: group._id,
          error: notificationError.message,
          memberIds
        });
      }
    }

    logger.info('Group created', { groupId: group._id, creatorId });
    return successResponse(res, { group: populatedGroup }, 201, 'Group created successfully');
  } catch (error) {
    logger.error('Error creating group', {
      error: error.message,
      creatorId: req.user?.id,
      body: req.body
    });
    throw error;
  }
});

// @desc    Create group from event participants
// @route   POST /api/groups/from-event
// @access  Private
exports.createGroupFromEvent = asyncHandler(async (req, res) => {
  try {
    const { eventId, groupName } = req.body;
    const creatorId = req.user.id;

    if (!eventId || !groupName) {
      throw new ValidationError('Event ID and group name are required');
    }

    // Check if user has access to the event
    const event = await Event.findById(eventId);
    if (!event) {
      throw new NotFoundError('Event not found');
    }

    // Check if user is a participant in the event
    const isParticipant = event.participants.some(participant =>
      participant.user.toString() === creatorId
    );

    if (!isParticipant) {
      throw new ForbiddenError('You must be a participant in the event to create a group from it');
    }

    // Create group from event
    const group = await Group.createFromEvent(eventId, groupName, creatorId);

    // Populate the group
    const populatedGroup = await Group.findById(group._id)
      .populate('creator', 'username fullName profilePicture')
      .populate('members.user', 'username fullName profilePicture')
      .populate('events', 'title startTime endTime location');

    try {
      // Convert members to plain object with primitive values only
      const plainMembers = {};
      for (const member of populatedGroup.members) {
        if (member.user && member.user._id) {
          const userId = member.user._id.toString();
          plainMembers[userId] = {
            name: String(member.user.fullName || member.user.username || 'Unknown User'),
            avatar: String(member.user.profilePicture || ''),
            role: String(member.role || 'member')
          };
        }
      }

      await firebaseService.createGroup(group._id.toString(), {
        name: String(group.name),
        description: String(group.description || ''),
        creator: String(creatorId),
        members: plainMembers
      });
    } catch (firebaseError) {
      logger.error('Failed to sync group to Firebase', {
        groupId: group._id,
        error: firebaseError.message,
        creatorId
      });
    }
    // Send notifications to all group members
    try {
      const notificationPromises = group.members
        .filter(member => member.user.toString() !== creatorId)
        .map(member =>
          sendNotification(member.user, {
            title: 'Added to Group',
            body: `You've been added to the group "${group.name}" created from event "${event.title}"`
          }, {
            type: 'group_member_added',
            groupId: group._id.toString(),
            eventId
          })
        );
      await Promise.all(notificationPromises);
    } catch (notificationError) {
      logger.error('Failed to send notifications for group creation from event', {
        groupId: group._id,
        eventId,
        error: notificationError.message,
        memberCount: group.members.length
      });
      // Continue execution - notification failure shouldn't break group creation
    }

    logger.info('Group created from event', {
      groupId: group._id,
      eventId,
      creatorId,
      memberCount: group.members.length
    });

    return successResponse(res, { group: populatedGroup }, 201, 'Group created from event successfully');
  } catch (error) {
    logger.error('Error creating group from event', {
      error: error.message,
      creatorId: req.user?.id,
      eventId: req.body?.eventId,
      groupName: req.body?.groupName
    });
    throw error;
  }
});

// @desc    Get user's groups
// @route   GET /api/groups
// @access  Private
exports.getUserGroups = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { includeInactive = false } = req.query;

    const groups = await Group.getUserGroups(userId, includeInactive === 'true');

    const enrichedGroups = await Promise.all(groups.map(async group => {
      try {
        const fbData = await firebaseService.getGroupSnapshot(group._id);
        return {
          ...group.toObject(),
          lastMessage: fbData?.lastMessage || null,
          updatedAtFirebase: fbData?.updatedAt || null
        };
      } catch (firebaseError) {
        logger.warn('Failed to fetch Firebase data for group', {
          groupId: group._id,
          error: firebaseError.message
        });
        // Return group without Firebase data if sync fails
        return {
          ...group.toObject(),
          lastMessage: null,
          updatedAtFirebase: null
        };
      }
    }));

    logger.info('User groups retrieved', { userId, groupCount: enrichedGroups.length });
    return successResponse(res, { groups: enrichedGroups });
  } catch (error) {
    logger.error('Error retrieving user groups', {
      error: error.message,
      userId: req.user?.id,
      includeInactive: req.query?.includeInactive
    });
    throw error;
  }
});

// @desc    Get single group
// @route   GET /api/groups/:id
// @access  Private
exports.getGroup = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const group = await Group.findById(id)
      .populate('creator', 'username fullName profilePicture')
      .populate('members.user', 'username fullName profilePicture')
      .populate('members.addedBy', 'username fullName')
      .populate('events', 'title startTime endTime location description');

    if (!group) throw new NotFoundError('Group not found');
    if (!group.isMember(userId)) throw new ForbiddenError('You are not a member of this group');

    let fbGroup = null;
    try {
      fbGroup = await firebaseService.getGroupSnapshot(id);
    } catch (firebaseError) {
      logger.warn('Failed to fetch Firebase data for group', {
        groupId: id,
        error: firebaseError.message
      });
      // Continue without Firebase data
    }

    return successResponse(res, {
      group: {
        ...group.toObject(),
        lastMessage: fbGroup?.lastMessage || null,
        lastActiveAt: fbGroup?.updatedAt || group.updatedAt
      }
    });
  } catch (error) {
    logger.error('Error retrieving group', {
      error: error.message,
      groupId: req.params?.id,
      userId: req.user?.id
    });
    throw error;
  }
});

// @desc    Update group
// @route   PUT /api/groups/:id
// @access  Private
exports.updateGroup = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, settings } = req.body;
    const userId = req.user.id;

    const group = await Group.findById(id);
    if (!group) throw new NotFoundError('Group not found');
    if (!group.isAdmin(userId)) throw new ForbiddenError('Only group admins can update the group');

    if (name) group.name = name.trim();
    if (description) group.description = description?.trim();
    if (settings) group.settings = { ...group.settings, ...settings };
    await group.save();

    const populatedGroup = await Group.findById(group._id)
      .populate('creator', 'username fullName profilePicture')
      .populate('members.user', 'username fullName profilePicture')
      .populate('events', 'title startTime endTime location');

    try {
      firebaseService.updateGroup(group._id.toString(), {
        name: group.name,
        description: group.description,
        settings: group.settings,
        updatedAt: new Date().toISOString()
      });
    } catch (firebaseError) {
      logger.error('Failed to update group in Firebase', {
        groupId: id,
        error: firebaseError.message,
        userId
      });
      // Continue execution - Firebase sync failure shouldn't break group update
    }

    logger.info('Group updated', { groupId: id, userId });
    return successResponse(res, { group: populatedGroup }, 200, 'Group updated successfully');
  } catch (error) {
    logger.error('Error updating group', {
      error: error.message,
      groupId: req.params?.id,
      userId: req.user?.id,
      body: req.body
    });
    throw error;
  }
});

// @desc    Add member to group
// @route   POST /api/groups/:id/members
// @access  Private
exports.addMember = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { userId: memberId, role = 'member' } = req.body;
    const currentUserId = req.user.id;

    const group = await Group.findById(id);
    if (!group) throw new NotFoundError('Group not found');
    if (!group.canAddMembers(currentUserId))
      throw new ForbiddenError('You do not have permission to add members');

    const userToAdd = await User.findById(memberId);
    if (!userToAdd) throw new NotFoundError('User not found');

    await group.addMember(memberId, currentUserId, role);

    try {
      firebaseService.addMember(id, {
        id: memberId,
        name: userToAdd.username,
        avatar: userToAdd.profilePicture,
        role
      });
    } catch (firebaseError) {
      logger.error('Failed to add member to Firebase', {
        groupId: id,
        memberId,
        error: firebaseError.message
      });
      // Continue execution - Firebase sync failure shouldn't break member addition
    }

    try {
      await sendNotification(memberId, {
        title: 'Added to Group',
        body: `You've been added to the group "${group.name}"`
      }, {
        type: 'group_member_added',
        groupId: group._id.toString()
      });
    } catch (notificationError) {
      logger.error('Failed to send notification for member addition', {
        groupId: id,
        memberId,
        error: notificationError.message
      });
      // Continue execution - notification failure shouldn't break member addition
    }

    const populatedGroup = await Group.findById(group._id)
      .populate('creator', 'username fullName profilePicture')
      .populate('members.user', 'username fullName profilePicture')
      .populate('members.addedBy', 'username fullName');

    logger.info('Member added to group', { groupId: id, memberId });
    return successResponse(res, { group: populatedGroup }, 200, 'Member added successfully');
  } catch (error) {
    logger.error('Error adding member to group', {
      error: error.message,
      groupId: req.params?.id,
      memberId: req.body?.userId,
      currentUserId: req.user?.id
    });
    throw error;
  }
});

// @desc    Remove member from group
// @route   DELETE /api/groups/:id/members/:memberId
// @access  Private
exports.removeMember = asyncHandler(async (req, res) => {
  try {
    const { id, memberId } = req.params;
    const currentUserId = req.user.id;

    const group = await Group.findById(id);
    if (!group) throw new NotFoundError('Group not found');
    if (!group.isAdmin(currentUserId) && currentUserId !== memberId)
      throw new ForbiddenError('You can only remove yourself or be an admin');

    await group.removeMember(memberId);

    try {
      firebaseService.removeMember(id, memberId);
    } catch (firebaseError) {
      logger.error('Failed to remove member from Firebase', {
        groupId: id,
        memberId,
        error: firebaseError.message
      });
      // Continue execution - Firebase sync failure shouldn't break member removal
    }

    try {
      await sendNotification(memberId, {
        title: 'Removed from Group',
        body: `You've been removed from the group "${group.name}"`
      }, {
        type: 'group_member_removed',
        groupId: group._id.toString()
      });
    } catch (notificationError) {
      logger.error('Failed to send notification for member removal', {
        groupId: id,
        memberId,
        error: notificationError.message
      });
      // Continue execution - notification failure shouldn't break member removal
    }

    const populatedGroup = await Group.findById(group._id)
      .populate('creator', 'username fullName profilePicture')
      .populate('members.user', 'username fullName profilePicture')
      .populate('members.addedBy', 'username fullName');

    logger.info('Member removed from group', { groupId: id, memberId });
    return successResponse(res, { group: populatedGroup }, 200, 'Member removed successfully');
  } catch (error) {
    logger.error('Error removing member from group', {
      error: error.message,
      groupId: req.params?.id,
      memberId: req.params?.memberId,
      currentUserId: req.user?.id
    });
    throw error;
  }
});

// @desc    Update member role
// @route  PUT /api/groups/:id/members/:memberId/role
// @access  Private
exports.updateMemberRole = asyncHandler(async (req, res) => {
  try {
    const { id, memberId } = req.params;
    const { role } = req.body;
    const currentUserId = req.user.id;

    if (!['admin', 'member'].includes(role)) {
      throw new ValidationError('Role must be either "admin" or "member"');
    }

    const group = await Group.findById(id);
    if (!group) {
      throw new NotFoundError('Group not found');
    }

    // Check if user is an admin
    if (!group.isAdmin(currentUserId)) {
      throw new ForbiddenError('Only group admins can update member roles');
    }

    // Update member role
    await group.updateMemberRole(memberId, role);

    // Populate the updated group
    const populatedGroup = await Group.findById(group._id)
      .populate('creator', 'username fullName profilePicture')
      .populate('members.user', 'username fullName profilePicture')
      .populate('members.addedBy', 'username fullName');

    logger.info('Member role updated', {
      groupId: id,
      memberId,
      newRole: role,
      updatedBy: currentUserId
    });

    return successResponse(res, { group: populatedGroup }, 200, 'Member role updated successfully');
  } catch (error) {
    logger.error('Error updating member role', {
      error: error.message,
      groupId: req.params?.id,
      memberId: req.params?.memberId,
      role: req.body?.role,
      currentUserId: req.user?.id
    });
    throw error;
  }
});

// @desc    Create event for group
// @route   POST /api/groups/:id/events
// @access  Private
exports.createGroupEvent = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      startTime,
      endTime,
      location,
      isAllDay = false,
      participationMode = 'invite_only' // 'auto_add' or 'invite_only'
    } = req.body;
    const creatorId = req.user.id;

    const group = await Group.findById(id);
    if (!group) {
      throw new NotFoundError('Group not found');
    }

    // Check if user can create events
    if (!group.canCreateEvents(creatorId)) {
      throw new ForbiddenError('You do not have permission to create events for this group');
    }

    // Create the event
    const event = await Event.create({
      calendar: null, // Group events don't belong to a specific calendar
      title,
      description,
      startTime,
      endTime,
      location,
      isAllDay,
      creator: creatorId
    });

    // Add creator as organizer
    await EventParticipant.create({
      event: event._id,
      user: creatorId,
      role: 'organizer',
      status: 'accepted'
    });

    // Add group members as participants based on participation mode
    if (participationMode === 'auto_add') {
      // Auto-add all group members
      const participantPromises = group.members
        .filter(member => member.user.toString() !== creatorId)
        .map(member =>
          EventParticipant.create({
            event: event._id,
            user: member.user,
            role: 'attendee',
            status: 'pending'
          })
        );
      await Promise.all(participantPromises);
    }

    // Add event to group
    await group.addEvent(event._id);

    // Send notifications to group members
    try {
      const notificationPromises = group.members
        .filter(member => member.user.toString() !== creatorId)
        .map(member => {
          const notificationType = participationMode === 'auto_add'
            ? 'group_event_auto_added'
            : 'group_event_invitation';

          return sendNotification(member.user, {
            title: 'New Group Event',
            body: `A new event "${event.title}" has been created in group "${group.name}"`
          }, {
            type: notificationType,
            groupId: group._id.toString(),
            eventId: event._id.toString()
          });
        });
      await Promise.all(notificationPromises);
    } catch (notificationError) {
      logger.error('Failed to send notifications for group event creation', {
        groupId: id,
        eventId: event._id,
        error: notificationError.message,
        memberCount: group.members.length
      });
      // Continue execution - notification failure shouldn't break event creation
    }

    // Populate the event
    const populatedEvent = await Event.findById(event._id)
      .populate('participants.user', 'username fullName profilePicture')
      .populate('creator', 'username fullName profilePicture');

    logger.info('Group event created', {
      groupId: id,
      eventId: event._id,
      creatorId,
      participationMode,
      memberCount: group.members.length
    });

    return successResponse(res, { event: populatedEvent }, 201, 'Group event created successfully');
  } catch (error) {
    logger.error('Error creating group event', {
      error: error.message,
      groupId: req.params?.id,
      creatorId: req.user?.id,
      eventData: req.body
    });
    throw error;
  }
});

// @desc    Search groups
// @route   GET /api/groups/search
// @access  Private
exports.searchGroups = asyncHandler(async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    const userId = req.user.id;

    if (!q || q.trim().length < 2) {
      throw new ValidationError('Search query must be at least 2 characters long');
    }

    const groups = await Group.searchGroups(q.trim(), userId, parseInt(limit));

    logger.info('Groups searched', {
      userId,
      query: q,
      resultsCount: groups.length
    });

    return successResponse(res, { groups });
  } catch (error) {
    logger.error('Error searching groups', {
      error: error.message,
      userId: req.user?.id,
      query: req.query?.q,
      limit: req.query?.limit
    });
    throw error;
  }
});

// @desc    Delete group
// @route   DELETE /api/groups/:id
// @access  Private
exports.deleteGroup = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const group = await Group.findById(id);
    if (!group) throw new NotFoundError('Group not found');
    if (group.creator.toString() !== userId)
      throw new ForbiddenError('Only the creator can delete the group');

    if (group.events.length > 0) {
      await Event.deleteMany({ _id: { $in: group.events } });
      await EventParticipant.deleteMany({ event: { $in: group.events } });
    }

    group.isActive = false;
    await group.save();

    try {
      firebaseService.deleteGroup(id);
    } catch (firebaseError) {
      logger.error('Failed to delete group from Firebase', {
        groupId: id,
        error: firebaseError.message,
        userId
      });
      // Continue execution - Firebase sync failure shouldn't break group deletion
    }

    try {
      await Promise.all(group.members
        .filter(member => member.user.toString() !== userId)
        .map(member => sendNotification(member.user, {
          title: 'Group Deleted',
          body: `The group "${group.name}" has been deleted`
        }, {
          type: 'group_deleted',
          groupId: group._id.toString()
        }))
      );
    } catch (notificationError) {
      logger.error('Failed to send notifications for group deletion', {
        groupId: id,
        error: notificationError.message,
        memberCount: group.members.length
      });
      // Continue execution - notification failure shouldn't break group deletion
    }

    logger.info('Group deleted', { groupId: id, userId });
    return successResponse(res, null, 200, 'Group deleted successfully');
  } catch (error) {
    logger.error('Error deleting group', {
      error: error.message,
      groupId: req.params?.id,
      userId: req.user?.id
    });
    throw error;
  }
});