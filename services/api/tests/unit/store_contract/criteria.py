"""Approved criteria of stories 068 to 072, each mapped to the shared test that proves it.

Keys are (story, criterion number). The criteria text lives with the stories; each entry names the
rule it covers by topic: 068 persistence across a restart, 069 trips/invites/share links,
070 accounts, 071 profiles, 072 saved places.
"""

CRITERIA = {
    ("068", 1): "test_trips_survive_a_restart",
    ("068", 2): "test_invites_and_editors_survive_a_restart",
    ("068", 3): "test_share_links_survive_a_restart",
    ("069", 1): "test_save_get_list_delete_round_trip",
    ("069", 2): "test_trip_id_alone_resolves_nothing_for_another_owner",
    ("069", 3): "test_saved_invite_is_found_by_token",
    ("069", 4): "test_deleted_invite_is_gone",
    ("069", 5): "test_linked_editor_sees_the_shared_trip",
    ("069", 6): "test_saved_link_is_found_by_token",
    ("069", 7): "test_deleted_link_is_gone",
    ("070", 1): "test_unconfirmed_account_cannot_sign_in",
    ("070", 2): "test_confirmed_account_signs_in_with_its_password",
    ("070", 3): "test_second_sign_up_with_same_email_is_refused",
    ("070", 4): "test_google_is_not_linked_until_linked",
    ("071", 1): "test_unsaved_profile_is_none",
    ("071", 2): "test_saved_profile_round_trips",
    ("071", 3): "test_second_save_replaces_the_first",
    ("071", 4): "test_profile_survives_a_restart",
    ("072", 1): "test_saved_place_is_listed_with_all_fields",
    ("072", 2): "test_saving_twice_keeps_one_entry",
    ("072", 3): "test_unsave_of_an_absent_place_is_fine",
    ("072", 4): "test_saved_places_survive_a_restart",
}
