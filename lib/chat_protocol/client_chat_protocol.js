if (Meteor.isClient) {

	Template.client_chat.events({
		'click #send_btn': function(event) {
			var message = $('#textearea').val();
			var to_who = $('#to_who').val();
			if (message != "") {
				$('#textearea').val("");
				ChatMessages.insert({
					sender_id: Meteor.userId(),
					sender_name: Meteor.user().username,
					receiver_id : to_who,
					date : new Date(),
					content: message
				});
			}
		},

		'keyup #textearea': function(event) {
			if($('#enter_activated').prop('checked') && event.which == 13) {
				var message = $('#textearea').val();
				if (message != "") {
					$('#textearea').val("");
					ChatMessages.insert({
						sender_id: Meteor.userId(),
						sender_name: Meteor.user().username,
						receiver_id : Meteor.users.find({username : Session.get("callmate")}).fetch()[0]._id,
						date : new Date(),
						content: message
					});
				}
			}
		}
	});

	Template.client_chat.helpers({

    	'messages' : function() {
        	return ChatMessages.find();
    	},

    	'userIsSender' : function(id) {
    		return id == Meteor.userId();
    	},

    	'getDate' : function(date) {
    		var current_date = new Date();
    		var month = date.getMonth()+1;
    		var day = date.getDate();

    		if (current_date.getDate() == date.getDate()) {
    			return "à "+(current_date.getHours())+"h"+current_date.getMinutes();
    		}
    		else  {
    			return "le "+day+"/"+month+" à "+current_date.getHours()+"h"+current_date.getMinutes();
    		}
    	},

	});

}